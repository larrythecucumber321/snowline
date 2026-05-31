import { SNOW_EVALSCRIPT } from "./evalscript";
import type { Tile } from "./region";

const TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process";
const CATALOG_URL =
  "https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function hasCreds(): boolean {
  return Boolean(process.env.CDSE_CLIENT_ID && process.env.CDSE_CLIENT_SECRET);
}

let tokenCache: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.CDSE_CLIENT_ID ?? "",
    client_secret: process.env.CDSE_CLIENT_SECRET ?? "",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`CDSE auth failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    exp: Date.now() + data.expires_in * 1000,
  };
  return tokenCache.token;
}

// CDSE rate-limits the Process API, so cap concurrent calls and back off on 429.
const MAX_CONCURRENT = 3;
let active = 0;
const waiters: (() => void)[] = [];

async function runProcess(body: unknown): Promise<Buffer> {
  while (active >= MAX_CONCURRENT) {
    await new Promise<void>((r) => waiters.push(r));
  }
  active++;
  try {
    const token = await getToken();
    for (let attempt = 0; attempt < 7; attempt++) {
      const res = await fetch(PROCESS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (res.status === 429 && attempt < 6) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        throw new Error(
          `CDSE process failed (${res.status}): ${await res.text()}`,
        );
      }
      return Buffer.from(await res.arrayBuffer());
    }
    throw new Error("CDSE process failed: rate limited");
  } finally {
    active--;
    waiters.shift()?.();
  }
}

function processBody(
  tile: Tile,
  evalscript: string,
  fromIso: string,
  toIso: string,
  px: number,
  format: "image/tiff" | "image/png" | "image/jpeg",
  mosaickingOrder: "mostRecent" | "leastCC",
) {
  return {
    input: {
      bounds: {
        bbox: [tile.minLon, tile.minLat, tile.maxLon, tile.maxLat],
        properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" },
      },
      data: [
        {
          type: "sentinel-2-l2a",
          dataFilter: { timeRange: { from: fromIso, to: toIso }, mosaickingOrder },
        },
      ],
    },
    output: {
      width: px,
      height: px,
      responses: [{ identifier: "default", format: { type: format } }],
    },
    evalscript,
  };
}

// One Process API call -> a single-band GeoTIFF of snow classification.
export function fetchTileTiff(
  tile: Tile,
  fromIso: string,
  toIso: string,
  px: number,
): Promise<Buffer> {
  return runProcess(
    processBody(tile, SNOW_EVALSCRIPT, fromIso, toIso, px, "image/tiff", "mostRecent"),
  );
}

// One Process API call -> an image (PNG or JPEG), for the map imagery overlays.
export function fetchTileImage(
  tile: Tile,
  evalscript: string,
  fromIso: string,
  toIso: string,
  px: number,
  mosaickingOrder: "mostRecent" | "leastCC",
  format: "image/png" | "image/jpeg",
): Promise<Buffer> {
  return runProcess(
    processBody(tile, evalscript, fromIso, toIso, px, format, mosaickingOrder),
  );
}

// Newest Sentinel-2 acquisition over the region, for the freshness banner.
export async function newestSceneDate(
  bbox: [number, number, number, number],
  fromIso: string,
  toIso: string,
): Promise<string | null> {
  try {
    const token = await getToken();
    const res = await fetch(CATALOG_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        collections: ["sentinel-2-l2a"],
        bbox,
        datetime: `${fromIso}/${toIso}`,
        limit: 20,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: { properties?: { datetime?: string } }[];
    };
    const dates = (data.features ?? [])
      .map((f) => f.properties?.datetime)
      .filter((d): d is string => Boolean(d))
      .sort();
    return dates.length ? dates[dates.length - 1] : null;
  } catch {
    return null;
  }
}
