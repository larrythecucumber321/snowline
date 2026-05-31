"use client";

import type { Overlay } from "./TrailMap";

const OPTIONS: { k: Overlay; label: string }[] = [
  { k: "none", label: "Map" },
  { k: "photo", label: "Satellite" },
];

export default function LayerControl({
  value,
  onChange,
}: {
  value: Overlay;
  onChange: (v: Overlay) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg text-xs font-semibold shadow-lg ring-1 ring-black/10">
      {OPTIONS.map((o) => (
        <button
          key={o.k}
          onClick={() => onChange(o.k)}
          className={`px-3 py-1.5 transition ${
            value === o.k
              ? "bg-slate-900 text-white"
              : "bg-white/95 text-slate-600 hover:bg-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
