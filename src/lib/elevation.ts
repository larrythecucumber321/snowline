import { fromArrayBuffer } from "geotiff";
import { REGION } from "./region";
import { getBuffer, setBuffer } from "./cache";

// Elevation comes from the Copernicus GLO-90 DEM, hosted free and auth-free on
// AWS Open Data. Tiles are 1°×1° GeoTIFFs; we download the handful covering
// the region once, cache them, and sample locally — no per-point API, no
// rate limits.
const DEM_BUCKET = "https://copernicus-dem-90m.s3.amazonaws.com";
const DEM_TTL = 90 * 24 * 3600 * 1000;

interface DemTile {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  width: number;
  height: number;
  data: ArrayLike<number>;
}

function tileName(latSW: number, lonSW: number): string {
  const ns = `N${String(latSW).padStart(2, "0")}`;
  const ew =
    lonSW < 0
      ? `W${String(Math.abs(lonSW)).padStart(3, "0")}`
      : `E${String(lonSW).padStart(3, "0")}`;
  return `Copernicus_DSM_COG_30_${ns}_00_${ew}_00_DEM`;
}

let tileCache: Promise<DemTile[]> | null = null;

async function loadTile(latSW: number, lonSW: number): Promise<DemTile | null> {
  const name = tileName(latSW, lonSW);
  try {
    let buf = await getBuffer(`dem-${name}.tif`, DEM_TTL);
    if (!buf) {
      const res = await fetch(`${DEM_BUCKET}/${name}/${name}.tif`);
      if (!res.ok) return null; // tile may not exist (all-ocean cells)
      buf = Buffer.from(await res.arrayBuffer());
      await setBuffer(`dem-${name}.tif`, buf);
    }
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const tiff = await fromArrayBuffer(ab as ArrayBuffer);
    const image = await tiff.getImage();
    const [minLon, minLat, maxLon, maxLat] = image.getBoundingBox();
    const rasters = await image.readRasters();
    return {
      minLon,
      minLat,
      maxLon,
      maxLat,
      width: image.getWidth(),
      height: image.getHeight(),
      data: rasters[0] as ArrayLike<number>,
    };
  } catch {
    return null;
  }
}

function loadTiles(): Promise<DemTile[]> {
  if (tileCache) return tileCache;
  tileCache = (async () => {
    const jobs: Promise<DemTile | null>[] = [];
    for (let lat = Math.floor(REGION.minLat); lat <= Math.floor(REGION.maxLat); lat++) {
      for (let lon = Math.floor(REGION.minLon); lon <= Math.floor(REGION.maxLon); lon++) {
        jobs.push(loadTile(lat, lon));
      }
    }
    return (await Promise.all(jobs)).filter((t): t is DemTile => t !== null);
  })();
  return tileCache;
}

function sampleTiles(tiles: DemTile[], lon: number, lat: number): number | null {
  for (const t of tiles) {
    if (lon < t.minLon || lon > t.maxLon || lat < t.minLat || lat > t.maxLat) {
      continue;
    }
    const fx = (lon - t.minLon) / (t.maxLon - t.minLon);
    const fy = (t.maxLat - lat) / (t.maxLat - t.minLat);
    const col = Math.min(t.width - 1, Math.max(0, Math.floor(fx * t.width)));
    const row = Math.min(t.height - 1, Math.max(0, Math.floor(fy * t.height)));
    const v = t.data[row * t.width + col];
    if (v == null || Number.isNaN(v) || v < -100) return null;
    return v;
  }
  return null;
}

export async function getElevations(
  points: [number, number][],
): Promise<(number | null)[]> {
  const tiles = await loadTiles();
  return points.map((p) => sampleTiles(tiles, p[0], p[1]));
}

// A synchronous elevation lookup, for sampling many raster pixels at once.
export async function getElevationSampler(): Promise<
  (lon: number, lat: number) => number | null
> {
  const tiles = await loadTiles();
  return (lon, lat) => sampleTiles(tiles, lon, lat);
}

// Downhill aspect (degrees clockwise from north) from the DEM gradient.
// null where the terrain is near-flat or off the DEM.
export async function getAspectSampler(): Promise<
  (lon: number, lat: number) => number | null
> {
  const tiles = await loadTiles();
  return (lon, lat) => {
    const dLat = 0.0009;
    const dLon = 0.0009 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    const n = sampleTiles(tiles, lon, lat + dLat);
    const s = sampleTiles(tiles, lon, lat - dLat);
    const e = sampleTiles(tiles, lon + dLon, lat);
    const w = sampleTiles(tiles, lon - dLon, lat);
    if (n == null || s == null || e == null || w == null) return null;
    const dzNorth = n - s;
    const dzEast = e - w;
    if (Math.hypot(dzNorth, dzEast) < 2) return null; // ~flat over ~200 m
    let az = (Math.atan2(-dzEast, -dzNorth) * 180) / Math.PI;
    if (az < 0) az += 360;
    return az;
  };
}
