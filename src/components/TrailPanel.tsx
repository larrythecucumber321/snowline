"use client";

import { useState } from "react";
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from "@/lib/status";
import type { TrailSummary, TrailsResponse } from "@/lib/types";

function ElevationProfile({ trail }: { trail: TrailSummary }) {
  const VW = 320;
  const VH = 152;
  const ML = 42;
  const MR = 6;
  const MT = 8;
  const MB = 30;
  const PW = VW - ML - MR;
  const PH = VH - MT - MB;
  const baseY = MT + PH;

  const segs = trail.segments;
  const elevs = segs
    .map((s) => s.properties.elevation)
    .filter((e): e is number => e != null);
  const minE = elevs.length ? Math.min(...elevs) : 0;
  const maxE = elevs.length ? Math.max(...elevs) : 1;
  const span = maxE - minE || 1;

  // Lay segments out by cumulative distance, with a small gap inserted where
  // the trail jumps to a disconnected piece (a different line).
  const trailLen = segs.reduce((a, s) => a + s.properties.lengthM, 0) || 1;
  const gap = trailLen * 0.02;
  const offsets: number[] = [];
  let cursor = 0;
  for (let i = 0; i < segs.length; i++) {
    if (i > 0 && segs[i].properties.line !== segs[i - 1].properties.line) {
      cursor += gap;
    }
    offsets.push(cursor);
    cursor += segs[i].properties.lengthM;
  }
  const total = cursor || 1;

  const bars = segs.map((s, i) => {
    const x = ML + (offsets[i] / total) * PW;
    const w = Math.max((s.properties.lengthM / total) * PW, 0.7);
    const e = s.properties.elevation;
    const h = e != null ? 3 + ((e - minE) / span) * (PH - 3) : PH;
    return (
      <rect
        key={i}
        x={x}
        y={baseY - h}
        width={w + 0.5}
        height={h}
        fill={STATUS_COLOR[s.properties.status]}
      />
    );
  });

  return (
    <div>
      <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full">
        <rect
          x={ML}
          y={MT}
          width={PW}
          height={PH}
          fill="#f8fafc"
          stroke="#e2e8f0"
        />
        {bars}
        {/* Y axis */}
        <text x={ML - 5} y={MT + 8} textAnchor="end" fontSize="9" fill="#94a3b8">
          {Math.round(maxE)}
        </text>
        <text x={ML - 5} y={baseY} textAnchor="end" fontSize="9" fill="#94a3b8">
          {Math.round(minE)}
        </text>
        <text
          x={11}
          y={MT + PH / 2}
          fontSize="9.5"
          fill="#64748b"
          textAnchor="middle"
          transform={`rotate(-90 11 ${MT + PH / 2})`}
        >
          Elevation (m)
        </text>
        {/* X axis */}
        <text x={ML} y={VH - 12} fontSize="9" fill="#94a3b8" textAnchor="start">
          0
        </text>
        <text
          x={ML + PW}
          y={VH - 12}
          fontSize="9"
          fill="#94a3b8"
          textAnchor="end"
        >
          {(trailLen / 1000).toFixed(1)} km
        </text>
        <text
          x={ML + PW / 2}
          y={VH - 12}
          fontSize="9.5"
          fill="#64748b"
          textAnchor="middle"
        >
          Distance along trail
        </text>
      </svg>
      <p className="mt-1 text-[10px] leading-snug text-slate-400">
        Each bar is a 150 m stretch of trail — its height is that point&rsquo;s
        elevation, its colour the snow condition there.
      </p>
    </div>
  );
}

export default function TrailPanel({
  trail,
  meta,
  onClose,
}: {
  trail: TrailSummary;
  meta: TrailsResponse["meta"];
  onClose: () => void;
}) {
  const pctClear = Math.round(trail.percentClear * 100);
  const [copied, setCopied] = useState(false);

  const breakdown = STATUS_ORDER.map((status) => ({
    status,
    count: trail.segments.filter((s) => s.properties.status === status).length,
  })).filter((b) => b.count > 0);

  const share = () => {
    const url = `${window.location.origin}${window.location.pathname}?trail=${encodeURIComponent(trail.id)}`;
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => {},
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 p-4">
        <div>
          <h2 className="text-base font-bold leading-tight text-slate-900">
            {trail.name}
          </h2>
          <p className="text-xs text-slate-500">
            {(trail.lengthM / 1000).toFixed(1)} km
            {trail.gainM > 0 && <> · ↑ {trail.gainM} m gain</>}
            {trail.maxElevation != null && (
              <> · {trail.minElevation}–{trail.maxElevation} m</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={share}
            className="rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            {copied ? "Copied!" : "Share"}
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5">
              <path
                fill="currentColor"
                d="m10 8.6 4-4 1.4 1.4-4 4 4 4L14 15.4l-4-4-4 4L4.6 14l4-4-4-4L6 4.6z"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium text-slate-500">
              Snow-free
            </span>
            <span
              className={`text-2xl font-bold ${
                pctClear >= 90
                  ? "text-emerald-600"
                  : pctClear >= 50
                    ? "text-sky-600"
                    : "text-blue-600"
              }`}
            >
              {pctClear}%
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${pctClear}%` }}
            />
          </div>
        </div>

        <ElevationProfile trail={trail} />

        <div>
          <div className="mb-1.5 text-xs font-medium text-slate-500">
            Segment breakdown
          </div>
          <ul className="space-y-1">
            {breakdown.map((b) => (
              <li
                key={b.status}
                className="flex items-center justify-between text-xs"
              >
                <span className="flex items-center gap-2 text-slate-600">
                  <span
                    className="inline-block h-1.5 w-5 rounded-full"
                    style={{ background: STATUS_COLOR[b.status] }}
                  />
                  {STATUS_LABEL[b.status]}
                </span>
                <span className="font-medium text-slate-500">
                  {Math.round((b.count / trail.segments.length) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="rounded-md bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-500 ring-1 ring-slate-200">
          {meta.mode === "satellite" ? (
            <>
              Conditions modelled from Sentinel-2 imagery (newest scene{" "}
              {meta.sceneDate
                ? new Date(meta.sceneDate).toLocaleDateString()
                : "recent"}
              ). Each segment is classified by elevation against the current
              snow line — ≈{meta.snowLineSunny} m on sun-facing slopes, ≈
              {meta.snowLineShady} m on shaded ones. &ldquo;Patchy&rdquo; is the
              melt-out transition zone.
            </>
          ) : (
            <>
              No live imagery — classified against a default {meta.snowLine} m
              snow line. Treat as a rough guide.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
