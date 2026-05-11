<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import type { GeoJSONPolygon } from '$lib/types/geo';
  import type {
    FeatureCollection,
    SightingFeatureProperties,
    SiteFeatureProperties
  } from '$lib/types/api';

  export type LayerKey = 'sectors' | 'sites' | 'sightings' | 'leads';
  export type LayerVisibility = Record<LayerKey, boolean>;

  type Props = {
    center: [number, number];
    zoom: number;
    style?: string;
    aoPolygon?: GeoJSONPolygon | null;
    siteFeatures?: FeatureCollection<SiteFeatureProperties>;
    sightingFeatures?: FeatureCollection<SightingFeatureProperties>;
    layerVisibility?: LayerVisibility;
    onMapClick?: (ll: { lon: number; lat: number }) => void;
  };

  // MapLibre's GeoJSONSourceSpecification.data wants a *mutable* FeatureCollection,
  // so we cannot widen `as const` here. Each helper that hands data to MapLibre
  // re-creates a fresh literal.
  function emptyFC() {
    return { type: 'FeatureCollection', features: [] } as Parameters<
      maplibregl.GeoJSONSource['setData']
    >[0];
  }

  let {
    center,
    zoom,
    style = 'https://demotiles.maplibre.org/style.json',
    aoPolygon = null,
    siteFeatures = { type: 'FeatureCollection', features: [] },
    sightingFeatures = { type: 'FeatureCollection', features: [] },
    layerVisibility = {
      sectors: true,
      sites: true,
      sightings: true,
      leads: false
    },
    onMapClick
  }: Props = $props();

  let containerEl: HTMLDivElement;
  let map: maplibregl.Map | null = null;
  let mapReady = $state(false);

  // Closure cell so the click handler installed once in onMount always reads
  // the latest prop. The $effect below keeps it fresh; the initial-only-capture
  // here is intentional because we never read the value of `onMapClickRef`
  // outside of the click handler closure.
  // svelte-ignore state_referenced_locally
  let onMapClickRef: Props['onMapClick'] = onMapClick;
  $effect(() => {
    onMapClickRef = onMapClick;
  });

  type AoSourceData =
    | { type: 'Feature'; geometry: GeoJSONPolygon; properties: Record<string, never> }
    | { type: 'FeatureCollection'; features: [] };

  function aoSource(p: GeoJSONPolygon | null): AoSourceData {
    return p
      ? { type: 'Feature', geometry: p, properties: {} }
      : { type: 'FeatureCollection', features: [] };
  }

  // GeoJSONSource accepts a structurally-compatible FeatureCollection — our
  // wire shape from $lib/types/api uses a narrower geometry union that's fine
  // at runtime; an `as unknown` cast keeps the type signal honest.
  function asGeoJSONData<T>(fc: FeatureCollection<T>) {
    return fc as unknown as Parameters<maplibregl.GeoJSONSource['setData']>[0];
  }

  const SITE_COLOR_BY_LIFECYCLE: maplibregl.ExpressionSpecification = [
    'match',
    ['get', 'lifecycleState'],
    'discovered', '#94a3b8', // slate
    'assessed', '#60a5fa', // blue
    'in_sanitation', '#fbbf24', // amber
    'at_threshold', '#f97316', // orange
    'in_hold', '#a78bfa', // violet
    'handed_over', '#22c55e', // green
    'archived', '#525252', // neutral-600
    '#94a3b8'
  ];

  const HIT_LAYERS = ['sites-circle', 'sightings-circle'];

  function installRuntimeLayers(
    m: maplibregl.Map,
    ao: GeoJSONPolygon | null,
    sFC: FeatureCollection<SiteFeatureProperties>,
    sgFC: FeatureCollection<SightingFeatureProperties>
  ) {
    if (!m.getSource('sectors')) {
      m.addSource('sectors', { type: 'geojson', data: emptyFC() });
    }
    if (!m.getSource('leads')) {
      m.addSource('leads', { type: 'geojson', data: emptyFC() });
    }
    if (!m.getSource('sites')) {
      m.addSource('sites', { type: 'geojson', data: asGeoJSONData(sFC) });
    }
    if (!m.getSource('sightings')) {
      m.addSource('sightings', { type: 'geojson', data: asGeoJSONData(sgFC) });
    }
    if (!m.getSource('ao')) {
      m.addSource('ao', { type: 'geojson', data: aoSource(ao) });
    }
    if (!m.getLayer('ao-outline')) {
      m.addLayer({
        id: 'ao-outline',
        type: 'line',
        source: 'ao',
        paint: { 'line-color': '#fbbf24', 'line-width': 2 }
      });
    }
    if (!m.getLayer('sites-circle')) {
      m.addLayer({
        id: 'sites-circle',
        type: 'circle',
        source: 'sites',
        paint: {
          'circle-color': SITE_COLOR_BY_LIFECYCLE,
          'circle-radius': 7,
          'circle-stroke-color': '#0a0a0a',
          'circle-stroke-width': 1.5
        }
      });
    }
    if (!m.getLayer('sightings-circle')) {
      m.addLayer({
        id: 'sightings-circle',
        type: 'circle',
        source: 'sightings',
        paint: {
          'circle-color': '#fbbf24',
          'circle-radius': 4,
          'circle-stroke-color': '#0a0a0a',
          'circle-stroke-width': 1
        }
      });
    }
    applyVisibility(m, layerVisibility);
  }

  function applyVisibility(m: maplibregl.Map, vis: LayerVisibility) {
    // Renamed from `map` to avoid shadowing the module-level MapLibre
    // instance — the parameter `m` is the map; this local is just a layer
    // id lookup.
    const layerIdByKey: Record<LayerKey, string | null> = {
      sectors: null, // no layer rendered yet
      sites: 'sites-circle',
      sightings: 'sightings-circle',
      leads: null // no layer rendered yet
    };
    for (const key of Object.keys(layerIdByKey) as LayerKey[]) {
      const layerId = layerIdByKey[key];
      if (!layerId || !m.getLayer(layerId)) continue;
      m.setLayoutProperty(layerId, 'visibility', vis[key] ? 'visible' : 'none');
    }
  }

  onMount(() => {
    map = new maplibregl.Map({
      container: containerEl,
      style,
      center,
      zoom,
      attributionControl: { compact: true }
    });
    // lastStyle is seeded by the style-swap $effect on its first run; setting
    // it here would just duplicate that write.

    map.on('load', () => {
      if (!map) return;
      installRuntimeLayers(map, aoPolygon, siteFeatures, sightingFeatures);
      mapReady = true;
    });

    // MapLibre fires `click` at the end of EVERY mouseup, including a pan-end
    // even when the cursor barely moved. Distinguish a real tap from "click
    // that happened to terminate a drag" by measuring the pointer travel
    // between mousedown and mouseup. Threshold is touch-aware: finger jitter
    // on assistive-use touch devices routinely produces 4-8 px of drift even
    // for "stationary" taps, so we suppress at ≥8 px for touch, ≥4 px for
    // mouse (the desktop convention).
    let downAt: { x: number; y: number; isTouch: boolean; t: number } | null = null;
    const DRAG_PX_MOUSE = 4;
    const DRAG_PX_TOUCH = 8;
    // Window during which a `mousedown` immediately following a `touchstart`
    // is the platform's synthesized compat event for the same finger contact
    // (Safari iOS, Firefox Android). Suppress overwrite so the touch flag
    // survives into the click decision.
    const TOUCH_COMPAT_MS = 350;

    map.on('touchstart', (e) => {
      downAt = { x: e.point.x, y: e.point.y, isTouch: true, t: performance.now() };
    });
    map.on('mousedown', (e) => {
      if (downAt?.isTouch && performance.now() - downAt.t < TOUCH_COMPAT_MS) return;
      const orig = e.originalEvent as unknown;
      // Detect touch via both TouchEvent (Safari, Firefox) and PointerEvent
      // with pointerType==='touch' (Chrome Android, recent Edge). Either
      // path widens the drag threshold for finger-jitter.
      let isTouch = false;
      if (typeof TouchEvent !== 'undefined' && orig instanceof TouchEvent) {
        isTouch = true;
      } else if (
        typeof PointerEvent !== 'undefined' &&
        orig instanceof PointerEvent &&
        orig.pointerType === 'touch'
      ) {
        isTouch = true;
      }
      downAt = { x: e.point.x, y: e.point.y, isTouch, t: performance.now() };
    });

    // Click handler: only fire onMapClick when the click did NOT land on one
    // of our feature layers AND it wasn't the tail of a drag.
    map.on('click', (e) => {
      const m = map;
      if (!m) return;
      const fn = onMapClickRef;
      if (!fn) return;
      if (downAt) {
        const dx = e.point.x - downAt.x;
        const dy = e.point.y - downAt.y;
        const threshold = downAt.isTouch ? DRAG_PX_TOUCH : DRAG_PX_MOUSE;
        downAt = null;
        if (Math.hypot(dx, dy) >= threshold) return;
      }
      const layers = HIT_LAYERS.filter((l) => m.getLayer(l));
      const hits = layers.length > 0 ? m.queryRenderedFeatures(e.point, { layers }) : [];
      if (hits.length === 0) {
        fn({ lon: e.lngLat.lng, lat: e.lngLat.lat });
      }
    });
  });

  onDestroy(() => {
    map?.remove();
    map = null;
    mapReady = false;
  });

  // React to prop changes after the map is initialized.
  //
  // `center` is a fresh array on every parent re-evaluation (the page derives
  // it from `polygonVertexMean(...)`), so a naive `$effect` would fire on
  // every `invalidateAll()` and reset the user's pan/zoom whenever a sighting
  // or site was saved. Compare numerically against the last applied values
  // and skip when unchanged. We only force a `flyTo` when the underlying
  // data actually moved.
  let lastFly: { lon: number; lat: number; zoom: number } | null = null;
  $effect(() => {
    if (!mapReady || !map) return;
    const lon = center[0];
    const lat = center[1];
    if (
      lastFly &&
      lastFly.lon === lon &&
      lastFly.lat === lat &&
      lastFly.zoom === zoom
    ) {
      return;
    }
    lastFly = { lon, lat, zoom };
    map.flyTo({ center, zoom, duration: 0 });
  });

  // Style swaps wipe sources/layers. The `style.load` hook re-adds them from
  // scratch using the *current* prop values, so a concurrent feature/aoPolygon
  // change while the new style is still loading is not silently dropped.
  let lastStyle: string | undefined;
  $effect(() => {
    if (!mapReady || !map) return;
    const next = style;
    if (lastStyle === undefined) {
      lastStyle = next;
      return;
    }
    if (next === lastStyle) return;
    const m = map;
    lastStyle = next;
    m.setStyle(next);
    void m.once('style.load', () => {
      installRuntimeLayers(m, aoPolygon, siteFeatures, sightingFeatures);
    });
  });

  // Reactive data: AO polygon outline.
  $effect(() => {
    if (!mapReady || !map) return;
    const src = map.getSource('ao') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(aoSource(aoPolygon));
  });

  // Reactive data: site features.
  $effect(() => {
    if (!mapReady || !map) return;
    const src = map.getSource('sites') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(asGeoJSONData(siteFeatures));
  });

  // Reactive data: sighting features.
  $effect(() => {
    if (!mapReady || !map) return;
    const src = map.getSource('sightings') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(asGeoJSONData(sightingFeatures));
  });

  // Reactive: per-layer visibility.
  $effect(() => {
    if (!mapReady || !map) return;
    applyVisibility(map, layerVisibility);
  });
</script>

<div bind:this={containerEl} class="h-full w-full"></div>
