<script lang="ts">
  import MapShell, { type LayerKey, type LayerVisibility } from '$lib/components/map/MapShell.svelte';
  import LayerPanel from '$lib/components/map/LayerPanel.svelte';
  import DossierDrawer from '$lib/components/dossier/DossierDrawer.svelte';
  import SiteForm from '$lib/components/forms/SiteForm.svelte';
  import SightingForm from '$lib/components/forms/SightingForm.svelte';
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

  let layerVisibility = $state<LayerVisibility>({
    sectors: true,
    sites: true,
    sightings: true,
    leads: false
  });

  // LayerPanel still consumes the flat array shape; project from the typed map.
  const layers = $derived(
    (
      [
        { id: 'sectors', label: 'Sectors' },
        { id: 'sites', label: 'Sites' },
        { id: 'sightings', label: 'Sightings' },
        { id: 'leads', label: 'Leads' }
      ] as const
    ).map((l) => ({ ...l, visible: layerVisibility[l.id] }))
  );

  function toggleLayer(id: string) {
    if (id in layerVisibility) {
      const k = id as LayerKey;
      layerVisibility = { ...layerVisibility, [k]: !layerVisibility[k] };
    }
  }

  type DrawerState =
    | { kind: 'closed' }
    | { kind: 'site'; point: { lon: number; lat: number } | null }
    | { kind: 'sighting'; point: { lon: number; lat: number } | null };

  let drawer = $state<DrawerState>({ kind: 'closed' });

  function closeDrawer() {
    drawer = { kind: 'closed' };
  }

  function startCreateSite() {
    drawer = { kind: 'site', point: null };
  }

  function startCreateSighting() {
    drawer = { kind: 'sighting', point: null };
  }

  function onMapClick(ll: { lon: number; lat: number }) {
    drawer = { kind: 'sighting', point: ll };
  }

  const drawerTitle = $derived(
    drawer.kind === 'site'
      ? 'New site'
      : drawer.kind === 'sighting'
        ? 'New sighting'
        : ''
  );
</script>

<LayerPanel
  {layers}
  onToggle={toggleLayer}
  onCreateSite={startCreateSite}
  onCreateSighting={startCreateSighting}
/>
<div class="flex-1">
  <MapShell
    {center}
    {zoom}
    aoPolygon={data.operation.aoPolygon}
    siteFeatures={data.sites}
    sightingFeatures={data.sightings}
    {layerVisibility}
    {onMapClick}
  />
</div>
<DossierDrawer open={drawer.kind !== 'closed'} title={drawerTitle} onClose={closeDrawer}>
  {#if drawer.kind === 'site'}
    <SiteForm
      orgSlug={data.organization.slug}
      opSlug={data.operation.slug}
      initialPoint={drawer.point}
      onClose={closeDrawer}
    />
  {:else if drawer.kind === 'sighting'}
    <SightingForm
      orgSlug={data.organization.slug}
      opSlug={data.operation.slug}
      initialPoint={drawer.point}
      onClose={closeDrawer}
    />
  {/if}
</DossierDrawer>
