"use client";

import { useMemo, useState } from "react";
import type { TrailSummary } from "@/lib/types";

export default function SearchBox({
  trails,
  onPick,
}: {
  trails: TrailSummary[];
  onPick: (t: TrailSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  // One result per name (OSM can split a trail into several pieces) — keep
  // the longest, which is usually the most complete route.
  const byName = useMemo(() => {
    const m = new Map<string, TrailSummary>();
    for (const t of trails) {
      const cur = m.get(t.name);
      if (!cur || t.lengthM > cur.lengthM) m.set(t.name, t);
    }
    return [...m.values()];
  }, [trails]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return byName
      .filter((t) => t.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          (b.popular ? 1 : 0) - (a.popular ? 1 : 0) ||
          a.name.length - b.name.length,
      )
      .slice(0, 10);
  }, [byName, query]);

  return (
    <div className="relative w-72 max-w-full">
      <input
        type="text"
        value={query}
        placeholder="Search trails…"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full rounded-lg bg-white/95 px-3 py-2 text-sm text-slate-800 shadow-lg ring-1 ring-black/10 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-slate-400"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg bg-white py-1 shadow-xl ring-1 ring-black/10">
          {results.map((t) => (
            <li key={t.id}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(t);
                  setQuery(t.name);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-slate-100"
              >
                <span className="truncate text-slate-700">{t.name}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  {Math.round(t.percentClear * 100)}% clear
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
