"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TrailMap, { type Overlay } from "@/components/TrailMap";
import TrailPanel from "@/components/TrailPanel";
import Legend from "@/components/Legend";
import FreshnessBanner from "@/components/FreshnessBanner";
import FilterBar from "@/components/FilterBar";
import SearchBox from "@/components/SearchBox";
import LayerControl from "@/components/LayerControl";
import HowItWorks from "@/components/HowItWorks";
import { isPopular } from "@/lib/popular-hikes";
import type { SegmentFeature, TrailSummary, TrailsResponse } from "@/lib/types";

// Cumulative ascent, computed per continuous line (so jumps between
// disconnected trail pieces are not counted) and over a smoothed elevation
// series (so DEM sampling noise does not inflate the total).
function cumulativeGain(segments: SegmentFeature[]): number {
  const byLine = new Map<number, number[]>();
  for (const s of segments) {
    const e = s.properties.elevation;
    if (e == null) continue;
    const ln = s.properties.line;
    const list = byLine.get(ln);
    if (list) list.push(e);
    else byLine.set(ln, [e]);
  }
  let gain = 0;
  for (const elevs of byLine.values()) {
    const w = 2; // moving-average half-window
    const smooth = elevs.map((_, i) => {
      let sum = 0;
      let n = 0;
      for (let j = Math.max(0, i - w); j <= Math.min(elevs.length - 1, i + w); j++) {
        sum += elevs[j];
        n++;
      }
      return sum / n;
    });
    for (let i = 1; i < smooth.length; i++) {
      const d = smooth[i] - smooth[i - 1];
      if (d > 0) gain += d;
    }
  }
  return Math.round(gain);
}

export default function Home() {
  const [data, setData] = useState<TrailsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrailId, setSelectedTrailId] = useState<string | null>(null);
  const [popularOnly, setPopularOnly] = useState(true);
  const [snowFreeOnly, setSnowFreeOnly] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>("photo");
  const [showInfo, setShowInfo] = useState(false);
  const [flyTo, setFlyTo] = useState<[number, number, number, number] | null>(
    null,
  );
  const flewToInitial = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/trails-snapshot.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Could not load trail data (${r.status})`);
        return r.json();
      })
      .then((d: TrailsResponse) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Deep link: ?trail=<id> selects a trail on load (browser-only, so it must
  // run in an effect rather than during render).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("trail");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (t) setSelectedTrailId(t);
    else flewToInitial.current = true;
  }, []);

  // Keep the URL in sync with the current selection (for sharing).
  useEffect(() => {
    const url = selectedTrailId
      ? `${window.location.pathname}?trail=${encodeURIComponent(selectedTrailId)}`
      : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [selectedTrailId]);

  const summaries = useMemo<TrailSummary[]>(() => {
    if (!data) return [];
    const byTrail = new Map<string, SegmentFeature[]>();
    for (const f of data.features) {
      const id = f.properties.trailId;
      const list = byTrail.get(id);
      if (list) list.push(f);
      else byTrail.set(id, [f]);
    }
    const out: TrailSummary[] = [];
    for (const [id, segs] of byTrail) {
      segs.sort((a, b) => a.properties.index - b.properties.index);
      const clear = segs.filter((s) => s.properties.status === "clear").length;
      const elevs = segs
        .map((s) => s.properties.elevation)
        .filter((e): e is number => e != null);
      let minLon = Infinity;
      let minLat = Infinity;
      let maxLon = -Infinity;
      let maxLat = -Infinity;
      for (const s of segs) {
        for (const c of s.geometry.coordinates) {
          minLon = Math.min(minLon, c[0]);
          maxLon = Math.max(maxLon, c[0]);
          minLat = Math.min(minLat, c[1]);
          maxLat = Math.max(maxLat, c[1]);
        }
      }
      const name = segs[0].properties.trailName;
      out.push({
        id,
        name,
        segments: segs,
        percentClear: clear / segs.length,
        maxElevation: elevs.length ? Math.max(...elevs) : null,
        minElevation: elevs.length ? Math.min(...elevs) : null,
        gainM: cumulativeGain(segs),
        lengthM: segs.reduce((a, s) => a + s.properties.lengthM, 0),
        // Popular = a curated marquee hike, or a named OSM hiking route
        // (relation), or simply a substantial trail worth a trip.
        popular:
          isPopular(name) ||
          id.startsWith("r") ||
          segs.reduce((a, s) => a + s.properties.lengthM, 0) >= 4000,
        bbox: [minLon, minLat, maxLon, maxLat],
      });
    }
    return out;
  }, [data]);

  const popularCount = useMemo(
    () => summaries.filter((s) => s.popular).length,
    [summaries],
  );
  const snowFreeCount = useMemo(
    () => summaries.filter((s) => s.percentClear >= 0.9).length,
    [summaries],
  );

  const filterActive = popularOnly || snowFreeOnly;
  const passingTrailIds = useMemo(
    () =>
      summaries
        .filter((s) => !popularOnly || s.popular)
        .filter((s) => !snowFreeOnly || s.percentClear >= 0.9)
        .map((s) => s.id),
    [summaries, popularOnly, snowFreeOnly],
  );

  const selected = useMemo(
    () => summaries.find((s) => s.id === selectedTrailId) ?? null,
    [summaries, selectedTrailId],
  );

  // Fly to a deep-linked trail once the data is in.
  useEffect(() => {
    if (flewToInitial.current || !selected) return;
    flewToInitial.current = true;
    setFlyTo([...selected.bbox]);
  }, [selected]);

  const hasImagery = data?.meta.hasImagery ?? false;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden">
      <TrailMap
        data={data}
        selectedTrailId={selectedTrailId}
        onSelectTrail={setSelectedTrailId}
        filterActive={filterActive}
        passingTrailIds={passingTrailIds}
        overlay={overlay}
        flyTo={flyTo}
      />

      {/* Top-left controls */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 shadow-lg">
          <span className="text-sm font-bold tracking-tight text-white">
            ❄ SnowLine
          </span>
          <span className="hidden text-xs text-slate-300 sm:inline">
            Vancouver snow-free trails
          </span>
          <button
            onClick={() => setShowInfo(true)}
            className="ml-1 rounded-full border border-slate-500 px-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
            aria-label="How it works"
          >
            ?
          </button>
        </div>
        {data && <FreshnessBanner meta={data.meta} />}
        {data && summaries.length > 0 && (
          <div className="pointer-events-auto">
            <SearchBox
              trails={summaries}
              onPick={(t) => {
                setSelectedTrailId(t.id);
                setFlyTo([...t.bbox]);
              }}
            />
          </div>
        )}
        {data && summaries.length > 0 && (
          <div className="pointer-events-auto flex flex-wrap gap-2">
            <FilterBar
              label="Popular"
              active={popularOnly}
              onToggle={() => setPopularOnly((v) => !v)}
              passingCount={popularCount}
              totalCount={summaries.length}
            />
            <FilterBar
              label="Snow-free"
              active={snowFreeOnly}
              onToggle={() => setSnowFreeOnly((v) => !v)}
              passingCount={snowFreeCount}
              totalCount={summaries.length}
            />
            {hasImagery && (
              <LayerControl value={overlay} onChange={setOverlay} />
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 hidden sm:block">
        <Legend />
      </div>

      {/* Trail detail panel */}
      {selected && data && (
        <div className="absolute inset-x-0 bottom-0 z-20 max-h-[60%] overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/10 sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-3 sm:max-h-none sm:w-80 sm:rounded-xl">
          <TrailPanel
            trail={selected}
            meta={data.meta}
            onClose={() => setSelectedTrailId(null)}
          />
        </div>
      )}

      {/* How it works */}
      {showInfo && data && (
        <HowItWorks meta={data.meta} onClose={() => setShowInfo(false)} />
      )}

      {/* Loading overlay */}
      {!data && !error && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-white/75 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-300 border-t-slate-800" />
            <p className="text-sm font-medium text-slate-600">
              Loading trails…
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-white/90">
          <div className="max-w-sm rounded-lg bg-white p-5 text-center shadow-xl ring-1 ring-black/10">
            <p className="font-semibold text-slate-800">Could not load trails</p>
            <p className="mt-1 text-sm text-slate-500">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
