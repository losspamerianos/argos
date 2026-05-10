<script lang="ts">
  import MapShell from '$lib/components/map/MapShell.svelte';
  import LayerPanel from '$lib/components/map/LayerPanel.svelte';
  import DossierDrawer from '$lib/components/dossier/DossierDrawer.svelte';
  import type { GeoJSONPolygon } from '$lib/types/geo';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  function polygonCentroid(
    p: GeoJSONPolygon | null,
    fallback: [number, number]
  ): [number, number] {
    const ring = p?.coordinates?.[0];
    if (!ring?.length) return fallback;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const point of ring) {
      const lon = point?.[0];
      const lat = point?.[1];
      if (typeof lon !== 'number' || typeof lat !== 'number') continue;
      sx += lon;
      sy += lat;
      n++;
    }
    return n > 0 ? [sx / n, sy / n] : fallback;
  }

  const center = $derived(polygonCentroid(data.operation.aoPolygon, data.mapDefaults.center));
  const zoom = $derived(data.mapDefaults.zoom);

  let layers = $state([
    { id: 'sectors', label: 'Sectors', visible: true },
    { id: 'sites', label: 'Sites', visible: true },
    { id: 'leads', label: 'Leads', visible: false }
  ]);
  let dossierOpen = $state(false);

  function toggleLayer(id: string) {
    layers = layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l));
  }
</script>

<LayerPanel {layers} onToggle={toggleLayer} />
<div class="flex-1">
  <MapShell {center} {zoom} aoPolygon={data.operation.aoPolygon} />
</div>
<DossierDrawer open={dossierOpen} title="" onClose={() => (dossierOpen = false)} />
