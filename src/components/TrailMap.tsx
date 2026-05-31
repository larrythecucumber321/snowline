"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { STATUS_COLOR } from "@/lib/status";
import type { TrailsResponse } from "@/lib/types";

const COLOR_EXPR = [
  "match",
  ["get", "status"],
  "clear",
  STATUS_COLOR.clear,
  "patchy",
  STATUS_COLOR.patchy,
  "snow",
  STATUS_COLOR.snow,
  STATUS_COLOR["no-data"],
] as unknown as maplibregl.ExpressionSpecification;

const EMPTY: TrailsResponse = {
  type: "FeatureCollection",
  features: [],
  meta: {
    mode: "estimate",
    sceneDate: null,
    snowLine: 0,
    snowLineSunny: 0,
    snowLineShady: 0,
    trailCount: 0,
    generatedAt: "",
    hasImagery: false,
    tiles: [],
  },
};

export type Overlay = "none" | "photo";

interface Props {
  data: TrailsResponse | null;
  selectedTrailId: string | null;
  onSelectTrail: (id: string | null) => void;
  filterActive: boolean;
  passingTrailIds: string[];
  overlay: Overlay;
  flyTo: [number, number, number, number] | null;
}

export default function TrailMap({
  data,
  selectedTrailId,
  onSelectTrail,
  filterActive,
  passingTrailIds,
  overlay,
  flyTo,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const photoAdded = useRef(false);
  // Flips true once the style + base layers are ready, so the data/overlay
  // effects re-run if the snapshot arrived before the map finished loading.
  const [ready, setReady] = useState(false);
  const selectRef = useRef(onSelectTrail);
  const dataRef = useRef(data);

  useEffect(() => {
    selectRef.current = onSelectTrail;
    dataRef.current = data;
  });

  // Mount the map once.
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [-122.4, 49.75],
      zoom: 7.7,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const setupLayers = () => {
      if (map.getSource("trails")) return;
      map.addSource("trails", { type: "geojson", data: EMPTY });

      map.addLayer({
        id: "trails-halo",
        type: "line",
        source: "trails",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ff6a00",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 7, 14, 14],
        },
        filter: ["==", ["get", "trailId"], "___none___"],
      });

      map.addLayer({
        id: "trails-line",
        type: "line",
        source: "trails",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": COLOR_EXPR,
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2, 14, 6],
        },
      });

      map.resize();
      const src = map.getSource("trails") as maplibregl.GeoJSONSource | undefined;
      if (src && dataRef.current) {
        src.setData(dataRef.current as GeoJSON.FeatureCollection);
      }
      setReady(true);
    };

    if (map.isStyleLoaded()) setupLayers();
    else map.on("style.load", setupLayers);

    const resizeObserver = new ResizeObserver(() => map.resize());
    if (container.current) resizeObserver.observe(container.current);

    map.on("click", (e) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ["trails-line"] });
      selectRef.current(hits.length ? String(hits[0].properties?.trailId) : null);
    });
    map.on("mouseenter", "trails-line", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "trails-line", () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      photoAdded.current = false;
    };
  }, []);

  // Push new trail data.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !data) return;
    const src = map.getSource("trails") as maplibregl.GeoJSONSource | undefined;
    src?.setData(data as GeoJSON.FeatureCollection);
  }, [data, ready]);

  // Satellite imagery overlay — precomputed static tiles, added once.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !data || !data.meta.hasImagery) return;

    if (!photoAdded.current) {
      for (const t of data.meta.tiles) {
        const [minLon, minLat, maxLon, maxLat] = t.bbox;
        const srcId = `ovsrc-photo-${t.i}`;
        if (map.getSource(srcId)) continue;
        map.addSource(srcId, {
          type: "image",
          url: `/overlay/truecolor/${t.i}.jpg`,
          coordinates: [
            [minLon, maxLat],
            [maxLon, maxLat],
            [maxLon, minLat],
            [minLon, minLat],
          ],
        });
        map.addLayer(
          {
            id: `ov-photo-${t.i}`,
            type: "raster",
            source: srcId,
            layout: { visibility: "none" },
            paint: { "raster-opacity": 1, "raster-fade-duration": 0 },
          },
          "trails-halo",
        );
      }
      photoAdded.current = true;
    }

    const vis = overlay === "photo" ? "visible" : "none";
    for (const t of data.meta.tiles) {
      if (map.getLayer(`ov-photo-${t.i}`)) {
        map.setLayoutProperty(`ov-photo-${t.i}`, "visibility", vis);
      }
    }
  }, [overlay, data, ready]);

  // Highlight the selected trail.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setFilter("trails-halo", [
      "==",
      ["get", "trailId"],
      selectedTrailId ?? "___none___",
    ]);
  }, [selectedTrailId, ready]);

  // Trail filter.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setFilter(
      "trails-line",
      filterActive
        ? ([
            "in",
            ["get", "trailId"],
            ["literal", passingTrailIds],
          ] as unknown as maplibregl.FilterSpecification)
        : null,
    );
  }, [filterActive, passingTrailIds, ready]);

  // Fly to a searched trail.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    map.fitBounds(flyTo, {
      padding: { top: 90, bottom: 90, left: 90, right: 360 },
      maxZoom: 14.5,
      duration: 900,
    });
  }, [flyTo]);

  return <div ref={container} className="h-full w-full" />;
}
