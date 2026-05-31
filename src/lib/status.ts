import type { SegmentStatus } from "./types";

export const STATUS_COLOR: Record<SegmentStatus, string> = {
  clear: "#16a34a",
  patchy: "#38bdf8",
  snow: "#2563eb",
  "no-data": "#9ca3af",
};

export const STATUS_LABEL: Record<SegmentStatus, string> = {
  clear: "Snow-free",
  patchy: "Patchy snow",
  snow: "Snow",
  "no-data": "No data",
};

export const STATUS_ORDER: SegmentStatus[] = [
  "clear",
  "patchy",
  "snow",
  "no-data",
];
