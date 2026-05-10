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

  onMount(() => {
    map = new maplibregl.Map({
      container: containerEl,
      style,
      center,
      zoom,
      attributionControl: { compact: true }
    });

    map.on('load', () => {
      if (!map) return;
      for (const id of ['sectors', 'sites', 'leads']) {
        map.addSource(id, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }
      map.addSource('ao', {
        type: 'geojson',
        data: aoPolygon
          ? { type: 'Feature', geometry: aoPolygon, properties: {} }
          : { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'ao-outline',
        type: 'line',
        source: 'ao',
        paint: { 'line-color': '#fbbf24', 'line-width': 2 }
      });
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

  $effect(() => {
    if (!mapReady || !map) return;
    const src = map.getSource('ao') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(
      aoPolygon
        ? { type: 'Feature', geometry: aoPolygon, properties: {} }
        : { type: 'FeatureCollection', features: [] }
    );
  });
</script>

<div bind:this={containerEl} class="h-full w-full"></div>
