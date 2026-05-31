// Bounding box covering the hiking areas around Greater Vancouver: North Shore,
// Sea-to-Sky / Squamish, Garibaldi, Pemberton (Joffre Lakes), Golden Ears, the
// Coquitlam watershed, and the Chilliwack valley.
export const REGION = {
  minLon: -123.5,
  minLat: 49.0,
  maxLon: -121.3,
  maxLat: 50.5,
};

export const REGION_BBOX: [number, number, number, number] = [
  REGION.minLon,
  REGION.minLat,
  REGION.maxLon,
  REGION.maxLat,
];

// Sentinel-2 lookback window and per-tile raster size.
export const LOOKBACK_DAYS = 14;
export const TILE_DEG = 0.37;
export const TILE_PX = 512;
export const OVERLAY_PX = 768; // resolution of the precomputed imagery tiles
export const SEGMENT_M = 150;

export interface Tile {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export function tiles(): Tile[] {
  const out: Tile[] = [];
  for (let lon = REGION.minLon; lon < REGION.maxLon; lon += TILE_DEG) {
    for (let lat = REGION.minLat; lat < REGION.maxLat; lat += TILE_DEG) {
      out.push({
        minLon: lon,
        minLat: lat,
        maxLon: Math.min(lon + TILE_DEG, REGION.maxLon),
        maxLat: Math.min(lat + TILE_DEG, REGION.maxLat),
      });
    }
  }
  return out;
}

export function defaultSnowLine(): number {
  const v = Number(process.env.DEFAULT_SNOW_LINE_M);
  return Number.isFinite(v) && v > 0 ? v : 1300;
}
