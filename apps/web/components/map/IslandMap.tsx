'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Map as MlMap, Marker } from 'maplibre-gl';
import { layers, namedFlavor } from '@protomaps/basemaps';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import { interiorPoint, toneFor, type DistrictTone } from './districts';

let tilesReady = false;

/** Fill colours match the wash, mist and slate tokens. MapLibre cannot read Tailwind classes. */
const FILL: Record<DistrictTone, string> = {
  active: '#ffffff',
  other: '#d7dee7',
  unserved: '#415a77',
};
const LABEL_INK: Record<DistrictTone, string> = {
  active: '#5c6b7a',
  other: '#415a77',
  unserved: '#f7f9fb',
};

export type IslandMarker = {
  id: string;
  lat: number;
  lng: number;
  /** Tailwind classes for the dot, for example `bg-fresh`. */
  dotClass: string;
  title: string;
  caption?: string;
  badges?: string[];
  selected?: boolean;
  size?: 'pin' | 'vehicle' | 'depot';
  /** `glow` marks a shop with an order. `ripple` marks a shop that can be added next. */
  pulse?: 'glow' | 'ripple';
};

export type MapPath = {
  id: string;
  /** [lng, lat] pairs. */
  coordinates: [number, number][];
  color: string;
  width?: number;
};

export type MapCircle = {
  id: string;
  lat: number;
  lng: number;
  /** Closed ring as [lng, lat]. */
  ring: [number, number][];
  color: string;
};

export type MapView =
  | { mode: 'bounds'; names: string[] }
  | { mode: 'point'; lng: number; lat: number };

export type IslandMapHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
};

type Ring = [number, number];
type Feature = {
  type: 'Feature';
  properties: { name?: string; tone?: DistrictTone };
  geometry:
    | { type: 'Polygon'; coordinates: Ring[][] }
    | { type: 'MultiPolygon'; coordinates: Ring[][][] }
    | { type: 'LineString'; coordinates: Ring[] };
};

type Props = {
  tones: ReadonlyMap<string, DistrictTone>;
  view: MapView;
  markers: IslandMarker[];
  paths?: MapPath[];
  circles?: MapCircle[];
  onMarker?: (id: string) => void;
  /** When set, a click on the island reports the coordinate instead of doing nothing. */
  picking?: boolean;
  onPick?: (lng: number, lat: number) => void;
};

const ISLAND: [[number, number], [number, number]] = [
  [79.4, 5.85],
  [82.05, 9.95],
];

/** How far the island can slide, in pixels, once it already fills the view. */
const PAN_NUDGE_PX = 120;

function mercatorY(lat: number) {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

function mercatorLat(y: number) {
  return ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
}

/**
 * Keeps a short, equal slide in every direction when the whole island is on screen,
 * and still lets the view travel across the island after zooming in.
 */
function limitPan(lng: number, lat: number, zoom: number, width: number, height: number) {
  const world = 512 * 2 ** zoom;
  const halfLng = (width / 2) * (360 / world);
  const halfMerc = (height / 2) * ((2 * Math.PI) / world);
  const nudgeLng = PAN_NUDGE_PX * (360 / world);
  const nudgeMerc = PAN_NUDGE_PX * ((2 * Math.PI) / world);
  const [west, south] = ISLAND[0];
  const [east, north] = ISLAND[1];
  const midLng = (west + east) / 2;
  let minLng: number;
  let maxLng: number;
  if (halfLng * 2 >= east - west) {
    minLng = midLng - nudgeLng;
    maxLng = midLng + nudgeLng;
  } else {
    minLng = west - nudgeLng + halfLng;
    maxLng = east + nudgeLng - halfLng;
  }
  const southM = mercatorY(south);
  const northM = mercatorY(north);
  const midM = (southM + northM) / 2;
  let minM: number;
  let maxM: number;
  if (halfMerc * 2 >= northM - southM) {
    minM = midM - nudgeMerc;
    maxM = midM + nudgeMerc;
  } else {
    minM = southM - nudgeMerc + halfMerc;
    maxM = northM + nudgeMerc - halfMerc;
  }
  const nextLng = Math.min(maxLng, Math.max(minLng, lng));
  const nextLat = mercatorLat(Math.min(maxM, Math.max(minM, mercatorY(lat))));
  return { lng: nextLng, lat: nextLat, zoom: Math.min(15, Math.max(6, zoom)) };
}

function ringOf(feature: Feature): Ring[] {
  const { geometry } = feature;
  if (geometry.type === 'LineString') return geometry.coordinates;
  if (geometry.type === 'Polygon') return geometry.coordinates[0] ?? [];
  let best: Ring[] = [];
  for (const polygon of geometry.coordinates) {
    const ring = polygon[0] ?? [];
    if (ring.length > best.length) best = ring;
  }
  return best;
}

function paint(features: Feature[], tones: ReadonlyMap<string, DistrictTone>) {
  return {
    type: 'FeatureCollection' as const,
    features: features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        tone: toneFor(feature.properties.name ?? '', tones),
      },
    })),
  };
}

/** White sheet over India and the sea, with a hole for each Sri Lanka district. */
function outsideMask(features: Feature[]) {
  const holes: Ring[][] = [];
  for (const feature of features) {
    const { geometry } = feature;
    if (geometry.type === 'Polygon') {
      const ring = geometry.coordinates[0];
      if (ring && ring.length > 3) holes.push([...ring].reverse());
    } else if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates) {
        const ring = polygon[0];
        if (ring && ring.length > 3) holes.push([...ring].reverse());
      }
    }
  }
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [55, 1],
              [106, 1],
              [106, 16],
              [55, 16],
              [55, 1],
            ],
            ...holes,
          ],
        },
      },
    ],
  };
}

function labelPoints(features: Feature[], tones: ReadonlyMap<string, DistrictTone>) {
  return {
    type: 'FeatureCollection' as const,
    features: features.flatMap((feature) => {
      const name = feature.properties.name;
      if (!name || feature.geometry.type === 'LineString') return [];
      const ring =
        feature.geometry.type === 'Polygon'
          ? (feature.geometry.coordinates[0] ?? [])
          : ringOf(feature);
      if (ring.length < 3) return [];
      return [
        {
          type: 'Feature' as const,
          properties: { name, tone: toneFor(name, tones) },
          geometry: { type: 'Point' as const, coordinates: interiorPoint(ring) },
        },
      ];
    }),
  };
}

function boundsOf(features: Feature[]) {
  let minX = 180;
  let minY = 90;
  let maxX = -180;
  let maxY = -90;
  const walk = (value: unknown) => {
    if (Array.isArray(value) && typeof value[0] === 'number') {
      minX = Math.min(minX, value[0]);
      minY = Math.min(minY, value[1] as number);
      maxX = Math.max(maxX, value[0]);
      maxY = Math.max(maxY, value[1] as number);
      return;
    }
    if (Array.isArray(value)) value.forEach(walk);
  };
  for (const feature of features) walk(feature.geometry.coordinates);
  if (minX > maxX) return ISLAND;
  return [
    [minX, minY],
    [maxX, maxY],
  ] as [[number, number], [number, number]];
}

function markerElement(marker: IslandMarker) {
  const button = document.createElement('button');
  button.type = 'button';
  button.title = marker.title;
  button.className = 'relative flex flex-col items-center';
  if (marker.pulse) {
    const halo = document.createElement('span');
    const reach = marker.pulse === 'ripple' ? 'size-9' : 'size-6';
    halo.className = `pointer-events-none absolute ${reach} animate-ping rounded-full ${marker.dotClass} opacity-70`;
    button.appendChild(halo);
  }
  const dot = document.createElement('span');
  const size =
    marker.size === 'depot' ? 'size-7 rounded-[10px]' : marker.size === 'vehicle' ? 'size-5' : 'size-3.5';
  const shape = marker.size === 'depot' ? '' : 'rounded-full';
  const border = marker.dotClass.includes('border-') ? '' : 'border-2 border-surface';
  dot.className = `relative block shadow ${border} ${shape} ${size} ${marker.dotClass} ${
    marker.selected || marker.size === 'vehicle' ? 'ring-2 ring-ink ring-offset-2' : ''
  }`;
  if (marker.size === 'depot') {
    dot.innerHTML =
      '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f4f6f8" stroke-width="1.7" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)"><path d="M4 10.5 12 4l8 6.5V20H4z" stroke-linejoin="round"/></svg>';
  }
  let offset = 0;
  for (const badge of marker.badges ?? []) {
    const chip = document.createElement('span');
    chip.className = `absolute -top-1.5 flex size-3.5 items-center justify-center rounded-full text-[8px] font-bold leading-none text-surface ${
      badge === 'V' ? 'bg-scrim' : 'bg-chilled'
    }`;
    chip.style.right = `${-6 + offset}px`;
    chip.textContent = badge;
    dot.appendChild(chip);
    offset -= 12;
  }
  button.appendChild(dot);
  if (marker.caption) {
    const caption = document.createElement('span');
    caption.className =
      'mt-1 max-w-[150px] truncate rounded-pill bg-surface px-2 py-0.5 text-[11px] font-semibold leading-4 text-ink shadow';
    caption.textContent = marker.caption;
    button.appendChild(caption);
  }
  return button;
}

function focusBounds(features: Feature[], names: string[]) {
  const wanted = new Set(names);
  const match = features.filter((feature) => wanted.has(feature.properties.name ?? ''));
  return boundsOf(match.length ? match : features);
}

/**
 * Sri Lanka from local files under /maps: a Protomaps street archive
 * (cities, roads, names) with the district overlay painted on top.
 * Store pins are placed from database latitude and longitude.
 */
export const IslandMap = forwardRef<IslandMapHandle, Props>(function IslandMap(
  { tones, view, markers, paths = [], circles = [], onMarker, picking, onPick },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const mapRef = useRef<MlMap | null>(null);
  const featuresRef = useRef<Feature[]>([]);
  const markerRefs = useRef<Marker[]>([]);
  const onMarkerRef = useRef(onMarker);
  const onPickRef = useRef(onPick);
  const pickingRef = useRef(picking);
  const viewRef = useRef(view);
  const tonesRef = useRef(tones);
  onMarkerRef.current = onMarker;
  onPickRef.current = onPick;
  pickingRef.current = picking;
  viewRef.current = view;
  tonesRef.current = tones;

  useImperativeHandle(ref, () => ({
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    reset: () => {
      const names = viewRef.current.mode === 'bounds' ? viewRef.current.names : [];
      mapRef.current?.fitBounds(focusBounds(featuresRef.current, names), { padding: 36, duration: 400 });
    },
  }));

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let map: MlMap | null = null;
    let resize: ResizeObserver | null = null;

    void (async () => {
      const maplibregl = await import('maplibre-gl');
      if (cancelled || !host.current) return;
      if (!tilesReady) {
        maplibregl.addProtocol('pmtiles', new Protocol().tile);
        tilesReady = true;
      }
      const origin = window.location.origin;
      maplibregl.setWorkerUrl(`${origin}/maps/maplibre-gl-worker.mjs`);
      const flavor = {
        ...namedFlavor('light'),
        background: '#ffffff',
        earth: '#f7f9fb',
        water: '#ffffff',
      };
      const basemap = layers('protomaps', flavor, { lang: 'en' });
      for (const layer of basemap) {
        if (
          layer.type === 'symbol' &&
          /^(places_|water_label|earth_label|address_|pois|roads_labels|roads_shields|water_waterway)/.test(
            layer.id,
          )
        ) {
          layer.minzoom = Math.max(layer.minzoom ?? 0, 10);
        }
      }
      const created = new maplibregl.Map({
        container: host.current,
        attributionControl: false,
        renderWorldCopies: false,
        dragPan: { linearity: 0.3, maxSpeed: 1400, deceleration: 1400 },
        minZoom: 6,
        maxZoom: 15,
        bounds: ISLAND,
        fitBoundsOptions: { padding: 28 },
        style: {
          version: 8,
          glyphs: `${origin}/maps/fonts/{fontstack}/{range}.pbf`,
          sprite: `${origin}/maps/sprites/light`,
          sources: {
            protomaps: {
              type: 'vector',
              url: `pmtiles://${origin}/maps/sri-lanka.pmtiles`,
              attribution: '© OpenStreetMap',
            },
          },
          layers: basemap as never,
        },
      });
      created.setTransformConstrain((lngLat, zoom) => {
        const box = host.current?.getBoundingClientRect();
        const next = limitPan(lngLat.lng, lngLat.lat, zoom, box?.width || 1, box?.height || 1);
        return { center: new maplibregl.LngLat(next.lng, next.lat), zoom: next.zoom };
      });
      map = created;
      mapRef.current = created;
      resize = new ResizeObserver(() => {
        if (!cancelled) created.resize();
      });
      resize.observe(host.current);

      await new Promise<void>((resolve) => {
        if (created.isStyleLoaded()) resolve();
        else created.once('load', () => resolve());
      });
      if (cancelled || !mapRef.current) return;

      const res = await fetch('/maps/sri-lanka-districts.geojson');
      const collection = (await res.json()) as { features: Feature[] };
      if (cancelled || !mapRef.current) return;
      featuresRef.current = collection.features;
      const beforeLabel = created.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id;
      created.addSource('outside', { type: 'geojson', data: outsideMask(collection.features) });
      created.addLayer(
        {
          id: 'outside-fill',
          type: 'fill',
          source: 'outside',
          paint: { 'fill-color': '#ffffff', 'fill-opacity': 1 },
        },
        beforeLabel,
      );
      created.addSource('districts', { type: 'geojson', data: paint(collection.features, tonesRef.current) });
      created.addLayer(
        {
          id: 'district-fill',
          type: 'fill',
          source: 'districts',
          paint: {
            'fill-color': [
              'match',
              ['get', 'tone'],
              'active',
              FILL.active,
              'other',
              FILL.other,
              FILL.unserved,
            ],
            'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 1, 9, 1, 12, 0.2, 14, 0.08],
          },
        },
        beforeLabel,
      );
      created.addLayer(
        {
          id: 'district-line',
          type: 'line',
          source: 'districts',
          paint: {
            'line-color': ['match', ['get', 'tone'], 'unserved', '#ffffff', '#d3dbe4'],
            'line-width': 1.25,
          },
        },
        beforeLabel,
      );
      created.addSource('district-labels', {
        type: 'geojson',
        data: labelPoints(collection.features, tonesRef.current),
      });
      created.addLayer({
        id: 'district-label',
        type: 'symbol',
        source: 'district-labels',
        maxzoom: 10,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Medium'],
          'text-size': 12,
          'text-max-width': 8,
          'text-padding': 4,
        },
        paint: {
          'text-color': [
            'match',
            ['get', 'tone'],
            'active',
            LABEL_INK.active,
            'other',
            LABEL_INK.other,
            LABEL_INK.unserved,
          ],
        },
      });
      created.on('click', (event) => {
        if (!pickingRef.current) return;
        onPickRef.current?.(event.lngLat.lng, event.lngLat.lat);
      });

      const roads = await fetch('/maps/sri-lanka-roads.geojson');
      if (roads.ok && !cancelled && mapRef.current) {
        const roadCollection = (await roads.json()) as { features: Feature[] };
        created.addSource('roads', { type: 'geojson', data: roadCollection });
        created.addLayer({
          id: 'roads',
          type: 'line',
          source: 'roads',
          paint: {
            'line-color': '#415a77',
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 12, 1.5, 14, 2.6],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 10, 0.45, 13, 0.85],
          },
        });
      }

      created.addSource('overlay-lines', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      created.addLayer({
        id: 'overlay-lines',
        type: 'line',
        source: 'overlay-lines',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': 0.9,
        },
      });
      created.addSource('overlay-circles', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      created.addLayer({
        id: 'overlay-circle-fill',
        type: 'fill',
        source: 'overlay-circles',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 },
      });
      created.addLayer({
        id: 'overlay-circle-line',
        type: 'line',
        source: 'overlay-circles',
        paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 0.7 },
      });

      const current = viewRef.current;
      if (current.mode === 'point') created.flyTo({ center: [current.lng, current.lat], zoom: 11 });
      else created.fitBounds(focusBounds(featuresRef.current, current.names), { padding: 36, duration: 0 });

      if (!cancelled) setReady(true);
      created.once('idle', () => {
        if (!cancelled) setVisible(true);
      });
    })();

    return () => {
      cancelled = true;
      resize?.disconnect();
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // Mount once. Later effects push new tones, views and markers onto the live map.
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource('districts') as { setData?: (data: unknown) => void } | undefined;
    if (!source?.setData) return;
    source.setData(paint(featuresRef.current, tones));
    const labels = map?.getSource('district-labels') as { setData?: (data: unknown) => void } | undefined;
    labels?.setData?.(labelPoints(featuresRef.current, tones));
  }, [tones, ready]);

  // The camera moves only when the place to show really changes. A refresh hands in a new `view`
  // object for the same place, and acting on that would pull the map back out while someone is
  // zoomed in on it.
  const viewKey =
    view.mode === 'point' ? `p:${view.lng},${view.lat}` : `b:${[...view.names].sort().join('|')}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || featuresRef.current.length === 0) return;
    const current = viewRef.current;
    if (current.mode === 'point') {
      map.flyTo({
        center: [current.lng, current.lat],
        zoom: Math.max(map.getZoom(), 11),
        duration: 500,
      });
      return;
    }
    map.fitBounds(focusBounds(featuresRef.current, current.names), { padding: 36, duration: 500 });
  }, [viewKey, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const lines = map?.getSource('overlay-lines') as { setData?: (data: unknown) => void } | undefined;
    const rings = map?.getSource('overlay-circles') as { setData?: (data: unknown) => void } | undefined;
    if (!lines?.setData || !rings?.setData) return;
    lines.setData({
      type: 'FeatureCollection',
      features: paths
        .filter((path) => path.coordinates.length >= 2)
        .map((path) => ({
          type: 'Feature',
          properties: { color: path.color, width: path.width ?? 3 },
          geometry: { type: 'LineString', coordinates: path.coordinates },
        })),
    });
    rings.setData({
      type: 'FeatureCollection',
      features: circles
        .filter((circle) => circle.ring.length >= 4)
        .map((circle) => ({
          type: 'Feature',
          properties: { color: circle.color },
          geometry: { type: 'Polygon', coordinates: [circle.ring] },
        })),
    });
  }, [paths, circles, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    markerRefs.current.forEach((marker) => marker.remove());
    markerRefs.current = [];
    void import('maplibre-gl').then((maplibregl) => {
      if (cancelled || mapRef.current !== map) return;
      for (const item of markers) {
        const element = markerElement(item);
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          onMarkerRef.current?.(item.id);
        });
        markerRefs.current.push(
          new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([item.lng, item.lat]).addTo(map),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [markers, ready]);

  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = picking ? 'crosshair' : '';
  }, [picking, ready]);

  return (
    <div className="absolute inset-0 min-h-[420px] overflow-hidden bg-white">
      <div
        ref={host}
        className={`h-full w-full overflow-hidden transition-opacity duration-700 ease-out ${
          visible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      {!visible && (
        <div className="absolute inset-0 flex items-center justify-center" role="status">
          <span className="sr-only">Loading the map</span>
          <span
            aria-hidden
            className="size-8 animate-spin rounded-full border-2 border-ink/15 border-t-ink"
          />
        </div>
      )}
    </div>
  );
});
