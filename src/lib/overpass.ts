import { REGION } from "./region";
import { getJson, setJson } from "./cache";
import { haversine } from "./geo";
import type { Trail } from "./types";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const TRAILS_TTL = 7 * 24 * 3600 * 1000;
const UNNAMED = "Unnamed trail";
// Same-named pieces further apart than this are treated as different trails.
const NAME_MERGE_MAX_GAP = 4000; // metres

interface OverpassGeom {
  lat: number;
  lon: number;
}

interface OverpassElement {
  type: "way" | "relation" | "node";
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassGeom[];
  members?: {
    type: string;
    ref: number;
    role: string;
    geometry?: OverpassGeom[];
  }[];
}

type Pt = [number, number];
type Bbox = [number, number, number, number];

function toLine(geom: OverpassGeom[]): Pt[] {
  return geom.map((g) => [g.lon, g.lat] as Pt);
}

const nodeKey = (p: Pt) => `${p[1].toFixed(7)},${p[0].toFixed(7)}`;

function lineBbox(line: Pt[]): Bbox {
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let d = -Infinity;
  for (const p of line) {
    a = Math.min(a, p[0]);
    b = Math.min(b, p[1]);
    c = Math.max(c, p[0]);
    d = Math.max(d, p[1]);
  }
  return [a, b, c, d];
}

function bboxGapMeters(a: Bbox, b: Bbox): number {
  const dLon = Math.max(0, a[0] - b[2], b[0] - a[2]);
  const dLat = Math.max(0, a[1] - b[3], b[1] - a[3]);
  if (dLon === 0 && dLat === 0) return 0;
  const mLat = dLat * 111320;
  const mLon = dLon * 111320 * Math.cos((49.7 * Math.PI) / 180);
  return Math.hypot(mLat, mLon);
}

// Fuse polylines that share endpoints into maximal continuous lines, orienting
// each as it joins. A fully-connected trail collapses to one ordered line, so
// its elevation profile runs smoothly start-to-finish; genuinely disjoint
// pieces stay as separate lines.
function chainLines(lines: Pt[][]): Pt[][] {
  const valid = lines.filter((l) => l.length >= 2);
  const used = new Array(valid.length).fill(false);
  const ends = new Map<string, { i: number; start: boolean }[]>();
  valid.forEach((ln, i) => {
    for (const e of [
      { pt: ln[0], start: true },
      { pt: ln[ln.length - 1], start: false },
    ]) {
      const k = nodeKey(e.pt);
      const list = ends.get(k);
      if (list) list.push({ i, start: e.start });
      else ends.set(k, [{ i, start: e.start }]);
    }
  });

  const out: Pt[][] = [];
  for (let s = 0; s < valid.length; s++) {
    if (used[s]) continue;
    used[s] = true;
    let chain = valid[s].slice();

    for (let go = true; go; ) {
      go = false;
      for (const c of ends.get(nodeKey(chain[chain.length - 1])) ?? []) {
        if (used[c.i]) continue;
        used[c.i] = true;
        const ln = c.start ? valid[c.i] : [...valid[c.i]].reverse();
        chain = chain.concat(ln.slice(1));
        go = true;
        break;
      }
    }
    for (let go = true; go; ) {
      go = false;
      for (const c of ends.get(nodeKey(chain[0])) ?? []) {
        if (used[c.i]) continue;
        used[c.i] = true;
        const ln = c.start ? [...valid[c.i]].reverse() : valid[c.i];
        chain = ln.slice(0, -1).concat(chain);
        go = true;
        break;
      }
    }
    out.push(chain);
  }
  return out;
}

// Hiking routes (relations) plus named foot paths, stitched into whole trails.
export async function fetchTrails(): Promise<Trail[]> {
  const cached = await getJson<Trail[]>("trails-v3", TRAILS_TTL);
  if (cached) return cached;

  const { minLat, minLon, maxLat, maxLon } = REGION;
  const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;
  const query = `[out:json][timeout:120];
(
  way["highway"="path"]["name"](${bbox});
  way["route"="hiking"]["name"](${bbox});
  relation["route"="hiking"]["name"](${bbox});
);
out geom;`;

  let data: { elements: OverpassElement[] } | null = null;
  let lastErr = "";
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "SnowLine/1.0 (Vancouver trail snow map)",
          Accept: "application/json",
        },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) {
        lastErr = `Overpass error ${res.status}`;
        continue;
      }
      data = (await res.json()) as { elements: OverpassElement[] };
      break;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : "Overpass request failed";
    }
  }
  if (!data) throw new Error(lastErr || "Overpass unavailable");

  const trails: Trail[] = [];
  const memberWayIds = new Set<number>();

  // Relations first — a route's member ways belong to it, chained in order.
  for (const el of data.elements) {
    if (el.type !== "relation" || !el.members) continue;
    const memberLines: Pt[][] = [];
    for (const m of el.members) {
      if (m.type === "way" && m.geometry && m.geometry.length >= 2) {
        memberWayIds.add(m.ref);
        memberLines.push(toLine(m.geometry));
      }
    }
    if (memberLines.length === 0) continue;
    trails.push({
      id: `r${el.id}`,
      name: el.tags?.name ?? "Unnamed route",
      lines: chainLines(memberLines),
    });
  }

  // Standalone foot paths (not part of a relation).
  const pieces: { id: string; name: string; line: Pt[]; bbox: Bbox }[] = [];
  for (const el of data.elements) {
    if (el.type !== "way" || memberWayIds.has(el.id)) continue;
    if (!el.geometry || el.geometry.length < 2) continue;
    const line = toLine(el.geometry);
    pieces.push({
      id: `w${el.id}`,
      name: el.tags?.name ?? UNNAMED,
      line,
      bbox: lineBbox(line),
    });
  }

  trails.push(...stitchPieces(pieces));
  await setJson("trails-v3", trails);
  return trails;
}

// OSM splits trails into many ways with inconsistent names. Merge pieces when
// they connect end-to-end, or share a name AND are geographically close.
function stitchPieces(
  pieces: { id: string; name: string; line: Pt[]; bbox: Bbox }[],
): Trail[] {
  const parent = pieces.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Nodes interior to some way are junctions/pass-throughs.
  const interior = new Set<string>();
  for (const pc of pieces) {
    for (let i = 1; i < pc.line.length - 1; i++) {
      interior.add(nodeKey(pc.line[i]));
    }
  }

  const endpoints = new Map<string, number[]>();
  pieces.forEach((pc, idx) => {
    for (const end of [pc.line[0], pc.line[pc.line.length - 1]]) {
      const k = nodeKey(end);
      const list = endpoints.get(k);
      if (list) list.push(idx);
      else endpoints.set(k, [idx]);
    }
  });

  // Connect end-to-end pieces (absorb unnamed connectors into a named trail).
  for (const [k, idxs] of endpoints) {
    const distinct = [...new Set(idxs)];
    if (distinct.length !== 2 || interior.has(k)) continue;
    const [a, b] = distinct;
    const na = pieces[a].name;
    const nb = pieces[b].name;
    if (na === nb || na === UNNAMED || nb === UNNAMED) union(a, b);
  }

  // Same-named pieces that are geographically close belong to the same trail.
  // The proximity check stops a same-named trail in another valley from being
  // merged in; union-find transitivity still chains a genuinely long trail.
  const byName = new Map<string, number[]>();
  pieces.forEach((pc, idx) => {
    if (pc.name === UNNAMED) return;
    const list = byName.get(pc.name);
    if (list) list.push(idx);
    else byName.set(pc.name, [idx]);
  });
  for (const idxs of byName.values()) {
    for (let i = 0; i < idxs.length; i++) {
      for (let j = i + 1; j < idxs.length; j++) {
        if (
          bboxGapMeters(pieces[idxs[i]].bbox, pieces[idxs[j]].bbox) <
          NAME_MERGE_MAX_GAP
        ) {
          union(idxs[i], idxs[j]);
        }
      }
    }
  }

  const groups = new Map<number, number[]>();
  pieces.forEach((_, idx) => {
    const r = find(idx);
    const g = groups.get(r);
    if (g) g.push(idx);
    else groups.set(r, [idx]);
  });

  const lineLen = (ln: Pt[]) => {
    let d = 0;
    for (let i = 0; i < ln.length - 1; i++) d += haversine(ln[i], ln[i + 1]);
    return d;
  };

  const out: Trail[] = [];
  for (const idxs of groups.values()) {
    const lenByName = new Map<string, number>();
    for (const i of idxs) {
      const len = lineLen(pieces[i].line);
      lenByName.set(pieces[i].name, (lenByName.get(pieces[i].name) ?? 0) + len);
    }
    const named = [...lenByName.entries()]
      .filter(([n]) => n !== UNNAMED)
      .sort((a, b) => b[1] - a[1]);
    out.push({
      id: pieces[idxs[0]].id,
      name: named.length ? named[0][0] : UNNAMED,
      lines: chainLines(idxs.map((i) => pieces[i].line)),
    });
  }
  return out;
}
