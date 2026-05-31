"use client";

import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from "@/lib/status";

export default function Legend() {
  return (
    <div className="rounded-lg bg-white/95 px-3 py-2.5 text-xs shadow-lg ring-1 ring-black/10 backdrop-blur">
      <div className="mb-1.5 font-semibold text-slate-700">Trail condition</div>
      <ul className="space-y-1">
        {STATUS_ORDER.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className="inline-block h-1.5 w-6 rounded-full"
              style={{ background: STATUS_COLOR[s] }}
            />
            <span className="text-slate-600">{STATUS_LABEL[s]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
