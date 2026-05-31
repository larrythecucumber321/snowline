"use client";

import { STATUS_COLOR } from "@/lib/status";
import type { TrailsResponse } from "@/lib/types";

export default function HowItWorks({
  meta,
  onClose,
}: {
  meta: TrailsResponse["meta"];
  onClose: () => void;
}) {
  const sceneDate = meta.sceneDate
    ? new Date(meta.sceneDate).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "recent";

  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 p-4">
          <h2 className="text-lg font-bold text-slate-900">
            How SnowLine works
          </h2>
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

        <div className="space-y-4 p-4 text-sm leading-relaxed text-slate-600">
          <p>
            SnowLine estimates which Vancouver-area hiking trails are clear of
            snow, so you can pick a hike that&rsquo;s in season. It blends free
            satellite imagery with terrain data — nothing is crowd-reported.
          </p>

          <div>
            <h3 className="mb-1 font-semibold text-slate-800">
              The colours
            </h3>
            <ul className="space-y-1">
              {[
                ["clear", "Snow-free — comfortably below the snow line"],
                ["patchy", "Patchy — in the melt-out transition zone, expect some snow"],
                ["snow", "Snow — above the snow line, likely snow-covered"],
              ].map(([k, desc]) => (
                <li key={k} className="flex items-center gap-2">
                  <span
                    className="inline-block h-1.5 w-6 shrink-0 rounded-full"
                    style={{ background: STATUS_COLOR[k as "clear"] }}
                  />
                  <span>{desc}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-1 font-semibold text-slate-800">How it&rsquo;s built</h3>
            <p>
              Snow is detected from <strong>Sentinel-2</strong> satellite
              imagery (newest scene {sceneDate}). Rather than trust a single
              pixel per trail — forest canopy hides snow and shadows confuse it
              — SnowLine pools observations region-wide into a snow-line
              elevation that varies by area and by slope aspect (sun-facing
              slopes melt out first). Each trail is then classified by its
              elevation. Trails come from <strong>OpenStreetMap</strong> and
              elevation from the <strong>Copernicus DEM</strong>.
            </p>
          </div>

          <div className="rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900 ring-1 ring-amber-200">
            <h3 className="mb-1 font-semibold">Please read — this is an estimate</h3>
            <p>
              SnowLine is a planning aid, not ground truth. The satellite
              cannot see snow under the forest canopy, conditions change daily,
              and a single sunny slope or shaded gully can differ from the
              model. Always check recent trip reports, carry the essentials,
              and turn back if conditions aren&rsquo;t what you expected.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
