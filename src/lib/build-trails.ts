import { fetchTrails } from "./overpass";
import { getElevationSampler, getAspectSampler } from "./elevation";
import { loadSnowRasters } from "./snow";
import { buildSnowModel, aspectClass } from "./snow-model";
import { hasCreds, newestSceneDate } from "./cdse";
import { densify, haversine } from "./geo";
import { SEGMENT_M, REGION_BBOX, LOOKBACK_DAYS, tiles } from "./region";
import type { SegmentFeature, TrailsResponse } from "./types";

interface RawSegment {
  trailId: string;
  trailName: string;
  index: number;
  line: number;
  coords: [number, number][];
  mid: [number, number];
  lengthM: number;
}

// The full trail + snow pipeline: trails from OSM, ~150 m segments, the
// elevation-band snow model, and per-segment classification. This is the
// expensive work (Overpass + ~30 Sentinel-2 tiles + DEM) — too slow for a
// serverless request, so production serves a precomputed snapshot built by
// `scripts/snapshot.ts`. The /api/trails route uses it for local development.
export async function buildTrailsResponse(): Promise<TrailsResponse> {
  const trails = await fetchTrails();

  const segments: RawSegment[] = [];
  for (const t of trails) {
    let index = 0;
    t.lines.forEach((line, lineIdx) => {
      const pts = densify(line, SEGMENT_M);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        segments.push({
          trailId: t.id,
          trailName: t.name,
          index: index++,
          line: lineIdx,
          coords: [a, b],
          mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
          lengthM: haversine(a, b),
        });
      }
    });
  }

  const sampler = await getElevationSampler();
  const aspectSampler = await getAspectSampler();

  let rasters: Awaited<ReturnType<typeof loadSnowRasters>> = [];
  let sceneDate: string | null = null;
  if (hasCreds()) {
    try {
      rasters = await loadSnowRasters();
      const toIso = new Date().toISOString();
      const fromIso = new Date(Date.now() - LOOKBACK_DAYS * 864e5).toISOString();
      sceneDate = await newestSceneDate(REGION_BBOX, fromIso, toIso);
    } catch (err) {
      console.error("satellite path failed, falling back to elevation:", err);
      rasters = [];
    }
  }
  const model = buildSnowModel(rasters, sampler, aspectSampler);

  const features: SegmentFeature[] = segments.map((s) => {
    const elevation = sampler(s.mid[0], s.mid[1]);
    const aspect = aspectClass(aspectSampler(s.mid[0], s.mid[1]));
    const { status, prob } = model.classify(
      s.mid[0],
      s.mid[1],
      elevation,
      aspect,
    );
    return {
      type: "Feature",
      geometry: { type: "LineString", coordinates: s.coords },
      properties: {
        trailId: s.trailId,
        trailName: s.trailName,
        index: s.index,
        line: s.line,
        status,
        snowProbability: Math.round(prob * 100) / 100,
        elevation: elevation != null ? Math.round(elevation) : null,
        lengthM: Math.round(s.lengthM),
      },
    };
  });

  return {
    type: "FeatureCollection",
    features,
    meta: {
      mode: model.observed ? "satellite" : "estimate",
      sceneDate,
      snowLine: model.snowLine,
      snowLineSunny: model.snowLineSunny,
      snowLineShady: model.snowLineShady,
      trailCount: trails.length,
      generatedAt: new Date().toISOString(),
      hasImagery: hasCreds(),
      tiles: tiles().map((t, i) => ({
        i,
        bbox: [t.minLon, t.minLat, t.maxLon, t.maxLat],
      })),
      note: model.observed
        ? undefined
        : "No live imagery — trails classified against a default elevation snow line.",
    },
  };
}
