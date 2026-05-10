<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';

  type Polygon = { type: 'Polygon'; coordinates: number[][][] };

  type Props = {
    center: [number, number];
    zoom: number;
    style?: string;
    aoPolygon?: Polygon | null;
  };

  let {
    center,
    zoom,
    style = 'https://demotiles.maplibre.org/style.json',
    aoPolygon = null
  }: Props = $props();

  let containerEl: HTMLDivElement;
  let map: maplibregl.Map | null = null;

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
      if (aoPolygon) {
        map.addSource('ao', {
          type: 'geojson',
          data: { type: 'Feature', geometry: aoPolygon, properties: {} }
        });
        map.addLayer({
          id: 'ao-outline',
          type: 'line',
          source: 'ao',
          paint: { 'line-color': '#fbbf24', 'line-width': 2 }
        });
      }
    });
  });

  onDestroy(() => {
    map?.remove();
    map = null;
  });
</script>

<div bind:this={containerEl} class="h-full w-full"></div>
