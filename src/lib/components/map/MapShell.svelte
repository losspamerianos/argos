<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import type { GeoJSONPolygon } from '$lib/types/geo';

  type Props = {
    center: [number, number];
    zoom: number;
    style?: string;
    aoPolygon?: GeoJSONPolygon | null;
  };

  let {
    center,
    zoom,
    style = 'https://demotiles.maplibre.org/style.json',
    aoPolygon = null
  }: Props = $props();

  let containerEl: HTMLDivElement;
  let map: maplibregl.Map | null = null;
  let mapReady = $state(false);

  type AoSourceData =
    | { type: 'Feature'; geometry: GeoJSONPolygon; properties: Record<string, never> }
    | { type: 'FeatureCollection'; features: [] };

  function aoSource(p: GeoJSONPolygon | null): AoSourceData {
    return p
      ? { type: 'Feature', geometry: p, properties: {} }
      : { type: 'FeatureCollection', features: [] };
  }

  function installRuntimeLayers(m: maplibregl.Map, ao: GeoJSONPolygon | null) {
    for (const id of ['sectors', 'sites', 'leads']) {
      if (!m.getSource(id)) {
        m.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      }
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
  }

  onMount(() => {
    map = new maplibregl.Map({
      container: containerEl,
      style,
      center,
      zoom,
      attributionControl: { compact: true }
    });
    lastStyle = style;

    map.on('load', () => {
      if (!map) return;
      installRuntimeLayers(map, aoPolygon);
      mapReady = true;
    });
  });

  onDestroy(() => {
    map?.remove();
    map = null;
    mapReady = false;
  });

  // React to prop changes after the map is initialized.
  $effect(() => {
    if (!mapReady || !map) return;
    map.flyTo({ center, zoom, duration: 0 });
  });

  // Style swaps wipe sources/layers. The `style.load` hook re-adds them from
  // scratch using the *current* prop value (not the closure-captured value at
  // setStyle time), so a concurrent aoPolygon change while the new style is
  // still loading is not silently dropped.
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
    // `m.once(name, listener)` returns the Map (chainable); newer MapLibre
    // typings overload to `Promise<...>` when the listener is omitted, which
    // confuses no-floating-promises here. We pass a listener, so a void cast
    // documents the intent.
    void m.once('style.load', () => {
      installRuntimeLayers(m, aoPolygon);
    });
  });

  $effect(() => {
    if (!mapReady || !map) return;
    const src = map.getSource('ao') as maplibregl.GeoJSONSource | undefined;
    // During a style swap the source is briefly absent. The style.load handler
    // above re-installs it with the current aoPolygon, so silently no-oping
    // here is safe.
    if (!src) return;
    src.setData(aoSource(aoPolygon));
  });
</script>

<div bind:this={containerEl} class="h-full w-full"></div>
