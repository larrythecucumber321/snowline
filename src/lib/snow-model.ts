import { TILE_PX, defaultSnowLine } from "./region";
import { type SnowRaster, pixelCoord } from "./snow";
import type { SegmentStatus } from "./types";

// Methodology: pool observed open-ground pixels into snow-fraction vs.
// elevation samples, then fit a logistic snow-line curve. The logistic form is
// deliberately constrained — it can only be a clean S-curve from ~0 to ~1 —
// so noise (a few mis-classified low pixels) cannot push the curve up where
// there is plainly no snow. Curves are fitted per ~0.25° cell (the snow line
// varies coast-to-interior) and per slope aspect (north slopes hold snow
// lower). Forest and water pixels are excluded upstream — see the evalscript.

const BAND = 50;
const STRIDE = 4;
const MIN_BAND_SAMPLES = 25;
const MIN_USABLE_BANDS = 4;
const CLEAR_MAX = 0.15;
const SNOW_MIN = 0.6;
const CELL = 0.25;

// Logistic fit search space.
const E50_MIN = 400;
const E50_MAX = 2800;
const E50_STEP = 50;
const WIDTHS = [120, 160, 200, 250, 320];
// Anchor: snow effectively never reaches sea level here in season, so pin the
// low end of the curve to zero — keeps a fit from floating up.
const ANCHOR_ELEV = 250;
const ANCHOR_WEIGHT = 60;

export type AspectClass = "sunny" | "shady";

export function aspectClass(azimuth: number | null): AspectClass | null {
  if (azimuth == null) return null;
  return azimuth >= 112.5 && azimuth <= 247.5 ? "sunny" : "shady";
}

interface Curve {
  e50: number; // elevation of 50% snow cover
  w: number; // transition half-width
}
interface CurveSet {
  all: Curve;
  sunny: Curve;
  shady: Curve;
}
type BinMap = Map<number, { snow: number; total: number }>;
interface CellBins {
  all: BinMap;
  sunny: BinMap;
  shady: BinMap;
}

export interface SnowModel {
  observed: boolean;
  snowLine: number;
  snowLineSunny: number;
  snowLineShady: number;
  classify(
    lon: number,
    lat: number,
    elevation: number | null,
    aspect: AspectClass | null,
  ): { status: SegmentStatus; prob: number };
}

function logistic(elev: number, c: Curve): number {
  return 1 / (1 + Math.exp((c.e50 - elev) / c.w));
}

// Least-squares logistic fit over the elevation bands, weighted by sample
// count, with a zero anchor at low elevation.
function fitCurve(bins: BinMap): Curve | null {
  const pts = [...bins.entries()]
    .filter(([, v]) => v.total >= MIN_BAND_SAMPLES)
    .map(([elev, v]) => ({
      e: elev + BAND / 2,
      f: v.snow / v.total,
      w: v.total,
    }));
  if (pts.length < MIN_USABLE_BANDS) return null;
  pts.push({ e: ANCHOR_ELEV, f: 0, w: ANCHOR_WEIGHT });

  let best: Curve = { e50: defaultSnowLine(), w: 220 };
  let bestErr = Infinity;
  for (let e50 = E50_MIN; e50 <= E50_MAX; e50 += E50_STEP) {
    for (const w of WIDTHS) {
      let err = 0;
      for (const p of pts) {
        const pred = 1 / (1 + Math.exp((e50 - p.e) / w));
        const d = pred - p.f;
        err += p.w * d * d;
      }
      if (err < bestErr) {
        bestErr = err;
        best = { e50, w };
      }
    }
  }
  return best;
}

function statusFor(prob: number): SegmentStatus {
  return prob < CLEAR_MAX ? "clear" : prob > SNOW_MIN ? "snow" : "patchy";
}

function addBin(bins: BinMap, elev: number, isSnow: boolean) {
  const key = Math.floor(elev / BAND) * BAND;
  const e = bins.get(key) ?? { snow: 0, total: 0 };
  e.total++;
  if (isSnow) e.snow++;
  bins.set(key, e);
}

function mergeBins(into: BinMap, from: BinMap) {
  for (const [k, v] of from) {
    const e = into.get(k) ?? { snow: 0, total: 0 };
    e.snow += v.snow;
    e.total += v.total;
    into.set(k, e);
  }
}

const cellKey = (lon: number, lat: number) =>
  `${Math.floor(lon / CELL)},${Math.floor(lat / CELL)}`;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[s.length >> 1];
}

function defaultModel(): SnowModel {
  const line = defaultSnowLine();
  const all: Curve = { e50: line, w: 220 };
  const sunny: Curve = { e50: line + 120, w: 220 };
  const shady: Curve = { e50: line - 120, w: 220 };
  return {
    observed: false,
    snowLine: line,
    snowLineSunny: sunny.e50,
    snowLineShady: shady.e50,
    classify(_lon, _lat, elevation, aspect) {
      if (elevation == null) return { status: "no-data", prob: 0 };
      const c = aspect === "sunny" ? sunny : aspect === "shady" ? shady : all;
      const prob = logistic(elevation, c);
      return { status: statusFor(prob), prob };
    },
  };
}

export function buildSnowModel(
  rasters: SnowRaster[],
  elevSampler: (lon: number, lat: number) => number | null,
  aspectSampler: (lon: number, lat: number) => number | null,
): SnowModel {
  const cells = new Map<string, CellBins>();
  const cellOf = (k: string): CellBins => {
    let c = cells.get(k);
    if (!c) {
      c = { all: new Map(), sunny: new Map(), shady: new Map() };
      cells.set(k, c);
    }
    return c;
  };

  for (const r of rasters) {
    if (!r.data) continue;
    for (let row = 0; row < TILE_PX; row += STRIDE) {
      for (let col = 0; col < TILE_PX; col += STRIDE) {
        const v = r.data[row * TILE_PX + col];
        // 255 = no cloud-free observation, 254 = forest/water (uninformative).
        if (v === 255 || v === 254 || v == null || Number.isNaN(v)) continue;
        const [lon, lat] = pixelCoord(r.tile, col, row);
        const elev = elevSampler(lon, lat);
        if (elev == null) continue;
        const isSnow = v >= 0.5;
        const c = cellOf(cellKey(lon, lat));
        addBin(c.all, elev, isSnow);
        const ac = aspectClass(aspectSampler(lon, lat));
        if (ac) addBin(c[ac], elev, isSnow);
      }
    }
  }
  if (cells.size === 0) return defaultModel();

  const globalBins: CellBins = {
    all: new Map(),
    sunny: new Map(),
    shady: new Map(),
  };
  for (const c of cells.values()) {
    mergeBins(globalBins.all, c.all);
    mergeBins(globalBins.sunny, c.sunny);
    mergeBins(globalBins.shady, c.shady);
  }
  const globalAll = fitCurve(globalBins.all);
  if (!globalAll) return defaultModel();
  const globalCurves: CurveSet = {
    all: globalAll,
    sunny: fitCurve(globalBins.sunny) ?? globalAll,
    shady: fitCurve(globalBins.shady) ?? globalAll,
  };

  const cellCurves = new Map<string, CurveSet>();
  for (const k of cells.keys()) {
    const own = cells.get(k)!;
    let src = own;
    let allCurve = fitCurve(own.all);
    if (!allCurve) {
      const [cx, cy] = k.split(",").map(Number);
      const pooled: CellBins = {
        all: new Map(),
        sunny: new Map(),
        shady: new Map(),
      };
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const n = cells.get(`${cx + dx},${cy + dy}`);
          if (!n) continue;
          mergeBins(pooled.all, n.all);
          mergeBins(pooled.sunny, n.sunny);
          mergeBins(pooled.shady, n.shady);
        }
      }
      allCurve = fitCurve(pooled.all);
      src = pooled;
    }
    if (!allCurve) continue;
    cellCurves.set(k, {
      all: allCurve,
      sunny: fitCurve(src.sunny) ?? allCurve,
      shady: fitCurve(src.shady) ?? allCurve,
    });
  }

  const sets = [...cellCurves.values()];
  return {
    observed: true,
    snowLine: sets.length
      ? median(sets.map((c) => c.all.e50))
      : globalCurves.all.e50,
    snowLineSunny: sets.length
      ? median(sets.map((c) => c.sunny.e50))
      : globalCurves.sunny.e50,
    snowLineShady: sets.length
      ? median(sets.map((c) => c.shady.e50))
      : globalCurves.shady.e50,
    classify(lon, lat, elevation, aspect) {
      if (elevation == null) return { status: "no-data", prob: 0 };
      const cc = cellCurves.get(cellKey(lon, lat)) ?? globalCurves;
      const c = aspect === "sunny" ? cc.sunny : aspect === "shady" ? cc.shady : cc.all;
      const prob = logistic(elevation, c);
      return { status: statusFor(prob), prob };
    },
  };
}
