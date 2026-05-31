export type SegmentStatus = "clear" | "patchy" | "snow" | "no-data";

export interface Trail {
  id: string;
  name: string;
  // A trail is one or more polylines (relations stitch several member ways).
  lines: [number, number][][];
}

export interface SegmentProperties {
  trailId: string;
  trailName: string;
  index: number;
  line: number; // which continuous line of the trail this segment belongs to
  status: SegmentStatus;
  snowProbability: number; // 0..1
  elevation: number | null;
  lengthM: number;
}

export interface SegmentFeature {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: SegmentProperties;
}

export interface TrailSummary {
  id: string;
  name: string;
  segments: SegmentFeature[]; // ordered by index
  percentClear: number; // 0..1
  maxElevation: number | null;
  minElevation: number | null;
  gainM: number; // cumulative ascent
  lengthM: number;
  popular: boolean;
  bbox: [number, number, number, number]; // minLon,minLat,maxLon,maxLat
}

export interface OverlayTile {
  i: number;
  bbox: [number, number, number, number];
}

export interface TrailsResponse {
  type: "FeatureCollection";
  features: SegmentFeature[];
  meta: {
    mode: "satellite" | "estimate";
    sceneDate: string | null;
    snowLine: number;
    snowLineSunny: number;
    snowLineShady: number;
    trailCount: number;
    generatedAt: string;
    hasImagery: boolean;
    tiles: OverlayTile[];
    note?: string;
  };
}
