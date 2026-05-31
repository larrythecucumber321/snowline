import { fromArrayBuffer } from "geotiff";
import { fetchTileTiff } from "./cdse";
import { tiles, TILE_PX, LOOKBACK_DAYS, type Tile } from "./region";
import { getBuffer, setBuffer, dayKey } from "./cache";

export interface SnowRaster {
  tile: Tile;
  data: Float32Array | null; // 0 = clear, 1 = snow, 255 = no cloud-free obs
}

async function decodeTiff(buf: Buffer): Promise<Float32Array> {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const tiff = await fromArrayBuffer(ab as ArrayBuffer);
  const image = await tiff.getImage();
  const rasters = await image.readRasters();
  return rasters[0] as Float32Array;
}

async function loadTile(
  tile: Tile,
  idx: number,
  fromIso: string,
  toIso: string,
): Promise<SnowRaster> {
  const cacheKey = `snowtile-v2-${idx}-${dayKey()}.tiff`;
  try {
    let buf = await getBuffer(cacheKey, 24 * 3600 * 1000);
    if (!buf) {
      buf = await fetchTileTiff(tile, fromIso, toIso, TILE_PX);
      await setBuffer(cacheKey, buf);
    }
    return { tile, data: await decodeTiff(buf) };
  } catch (err) {
    console.error(`snow tile ${idx} failed:`, err);
    return { tile, data: null };
  }
}

// The 12 region tiles of Sentinel-2 snow classification, fetched in parallel
// and cached for the day. These feed the elevation-band snow model.
export async function loadSnowRasters(): Promise<SnowRaster[]> {
  const toIso = new Date().toISOString();
  const fromIso = new Date(Date.now() - LOOKBACK_DAYS * 864e5).toISOString();
  return Promise.all(
    tiles().map((tile, idx) => loadTile(tile, idx, fromIso, toIso)),
  );
}

// Pixel centre -> geographic coordinate, for joining rasters to the DEM.
export function pixelCoord(
  tile: Tile,
  col: number,
  row: number,
): [number, number] {
  const lon =
    tile.minLon + ((col + 0.5) / TILE_PX) * (tile.maxLon - tile.minLon);
  const lat =
    tile.maxLat - ((row + 0.5) / TILE_PX) * (tile.maxLat - tile.minLat);
  return [lon, lat];
}
