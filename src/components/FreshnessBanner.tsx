"use client";

import type { TrailsResponse } from "@/lib/types";

function fmtDate(iso: string | null): string {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function FreshnessBanner({
  meta,
}: {
  meta: TrailsResponse["meta"];
}) {
  const satellite = meta.mode === "satellite";
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white/95 px-3.5 py-2 text-xs shadow-lg ring-1 ring-black/10 backdrop-blur">
      <span className="flex items-center gap-1.5 font-semibold text-slate-800">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            satellite ? "bg-emerald-500" : "bg-amber-500"
          }`}
        />
        {satellite ? "Live satellite" : "Elevation estimate"}
      </span>
      {satellite ? (
        <span className="text-slate-600">
          Sentinel-2 · newest scene {fmtDate(meta.sceneDate)}
        </span>
      ) : (
        <span className="text-slate-600">
          Add Copernicus credentials for live imagery
        </span>
      )}
      <span className="text-slate-400">·</span>
      <span className="text-slate-600">
        Snow line ≈ <strong>{meta.snowLine} m</strong>
      </span>
      <span className="text-slate-400">·</span>
      <span className="text-slate-600">{meta.trailCount} trails</span>
    </div>
  );
}
