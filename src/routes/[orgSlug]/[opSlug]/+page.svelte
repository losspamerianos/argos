<script lang="ts">
  import MapShell from '$lib/components/map/MapShell.svelte';
  import LayerPanel from '$lib/components/map/LayerPanel.svelte';
  import DossierDrawer from '$lib/components/dossier/DossierDrawer.svelte';
  import type { GeoJSONPolygon } from '$lib/types/geo';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const FALLBACK_CENTER: [number, number] = [33.6694, 34.9787];

  function polygonCentroid(p: GeoJSONPolygon | null): [number, number] {
    if (!p?.coordinates?.[0]?.length) return FALLBACK_CENTER;
    const ring = p.coordinates[0];
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const point of ring) {
      sx += point[0];
      sy += point[1];
      n++;
    }
    return n > 0 ? [sx / n, sy / n] : FALLBACK_CENTER;
  }

  let center = $derived(polygonCentroid(data.operation.aoPolygon));

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
  <MapShell {center} zoom={13} aoPolygon={data.operation.aoPolygon} />
</div>
<DossierDrawer open={dossierOpen} title="" onClose={() => (dossierOpen = false)} />
