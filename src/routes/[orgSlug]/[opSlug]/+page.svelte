<script lang="ts">
  import MapShell from '$lib/components/map/MapShell.svelte';
  import LayerPanel from '$lib/components/map/LayerPanel.svelte';
  import DossierDrawer from '$lib/components/dossier/DossierDrawer.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let layers = $state([
    { id: 'sectors', label: 'Sectors', visible: true },
    { id: 'sites', label: 'Sites', visible: true },
    { id: 'leads', label: 'Leads', visible: false }
  ]);
  let dossierOpen = $state(false);

  function toggleLayer(id: string) {
    const idx = layers.findIndex((l) => l.id === id);
    if (idx >= 0) layers[idx].visible = !layers[idx].visible;
  }
</script>

<LayerPanel {layers} onToggle={toggleLayer} />
<div class="flex-1">
  <MapShell center={[33.6694, 34.9787]} zoom={12} />
</div>
<DossierDrawer open={dossierOpen} title="" onClose={() => (dossierOpen = false)} />
