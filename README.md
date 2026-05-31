# SnowLine

A live map of which Vancouver-area hiking and trail-running routes are still
holding snow — built for that late-spring window where lower trails have melted
out but higher ones haven't.

Each trail is broken into ~150 m segments and classified:

| Colour | Meaning |
|---|---|
| 🟢 green | Snow-free |
| 🔵 cyan | Patchy snow — the melt-out transition zone |
| 🔵 blue | Snow |
| ⚪ grey | No data |

## How it works

- **Trails** come from OpenStreetMap via the Overpass API — hiking *relations*
  (full named routes) plus named foot paths, with same-named fragments merged
  into whole trails.
- **Snow** is detected from **Sentinel-2 L2A** imagery on the free
  [Copernicus Data Space Ecosystem](https://dataspace.copernicus.eu/). For each
  pixel the app mosaics the last 14 days, picks the most recent cloud-free
  observation, and computes the Normalized Difference Snow Index
  (`NDSI = (B03 − B11) / (B03 + B11)`).
- **The model** (`src/lib/snow-model.ts`): rather than trusting a single noisy
  pixel per segment (forest canopy hides snow; shadows and clearings flip the
  classification), the app pools *all* observed pixels region-wide into a
  snow-fraction-vs-elevation curve, forces it monotonic, and classifies every
  segment by elevation against that curve. The result is clean and physically
  sensible — snow cover only increases with elevation.
- **Elevation** for every segment is sampled from the Copernicus GLO-90 DEM
  (free, on AWS Open Data).
- **Imagery overlays** — toggle true-colour Sentinel-2 photography or a
  translucent snow-cover layer under the trails.

All external calls run server-side and are cached to `.cache/` (trails for a
week, satellite tiles for a day, the final response for 6 hours).

## Running it

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. With no credentials the app runs in
**elevation-estimate mode** — fully usable, just not satellite-backed.

### Enabling live satellite imagery

1. Register a free account at https://dataspace.copernicus.eu/
2. Create an OAuth client in the
   [Sentinel Hub dashboard](https://shapps.dataspace.copernicus.eu/dashboard/)
   (User settings → OAuth clients → Create new).
3. Copy `.env.example` to `.env.local` and fill in `CDSE_CLIENT_ID` /
   `CDSE_CLIENT_SECRET`.
4. Restart `pnpm dev`. The freshness banner will switch to "Live satellite".

To force a refresh past the cache, hit `/api/trails?refresh=1` or delete
`.cache/`.

## Configuration

| Env var | Purpose |
|---|---|
| `CDSE_CLIENT_ID` / `CDSE_CLIENT_SECRET` | Copernicus Data Space OAuth client |
| `DEFAULT_SNOW_LINE_M` | Fallback snow line (m) when no imagery exists (default 1300) |

Region and tuning constants (bounding box, NDSI threshold, segment length) live
in `src/lib/region.ts` and `src/lib/evalscript.ts`.

## Caveats

- Snow detection is a planning aid, not ground truth — check recent trip
  reports too.
- **Forest canopy** is the hard limit: under trees the satellite sees treetops,
  not the ground. The model excludes forest pixels and reads the snow line from
  open terrain only, then applies it by elevation — but a forested trail just
  below the open-ground snow line may still hold more snow than it shows.
- The snow line is modelled per ~0.25° cell and split by slope aspect
  (sun-facing vs shaded); it still cannot capture a single wind-scoured ridge
  or a late-melting gully.
- NDSI thresholds, the cloud/canopy guards, and the clear/patchy/snow cutoffs
  are tunable in `src/lib/evalscript.ts` and `src/lib/snow-model.ts`.
- Full-route coverage depends on OpenStreetMap: hiking *relations* and
  same-named ways are stitched into whole trails, and unnamed connectors are
  absorbed — but a route whose OSM ways carry several different names will
  still appear in pieces.
