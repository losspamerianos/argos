<script lang="ts">
  import MapShell, { type LayerKey, type LayerVisibility } from '$lib/components/map/MapShell.svelte';
  import LayerPanel from '$lib/components/map/LayerPanel.svelte';
  import DossierDrawer from '$lib/components/dossier/DossierDrawer.svelte';
  import SiteForm from '$lib/components/forms/SiteForm.svelte';
  import SightingForm from '$lib/components/forms/SightingForm.svelte';
  import type { GeoJSONPolygon } from '$lib/types/geo';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Naive vertex-mean — *not* a true polygon centroid. Cheap enough for the
  // "give the map an opening viewport" use case where exact center doesn't
  // matter; a shoelace-area-weighted centroid would be marginally better but
  // is Phase-1B nice-to-have, not a correctness issue.
  function polygonVertexMean(
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

  const center = $derived(polygonVertexMean(data.operation.aoPolygon, data.mapDefaults.center));
  const zoom = $derived(data.mapDefaults.zoom);

  let layerVisibility = $state<LayerVisibility>({
    sectors: true,
    sites: true,
    sightings: true,
    leads: false
  });

  // LayerPanel still consumes the flat array shape; project from the typed map.
  // We only surface layers that actually render today; sectors / leads are
  // pre-registered sources without layer definitions, so showing their
  // toggles would be a dead-checkbox UX. They return in Phase 1B.
  const layers = $derived(
    (
      [
        { id: 'sites', label: 'Sites' },
        { id: 'sightings', label: 'Sightings' }
      ] as const
    ).map((l) => ({ ...l, visible: layerVisibility[l.id] }))
  );

  function toggleLayer(id: string) {
    // `Object.hasOwn` not `in` — symmetric with the validator hardening and
    // keeps prototype-chain keys out, even though the current callers only
    // pass IDs from a hard-coded list.
    if (Object.hasOwn(layerVisibility, id)) {
      const k = id as LayerKey;
      layerVisibility = { ...layerVisibility, [k]: !layerVisibility[k] };
    }
  }

  // `nonce` increments on every drawer open so {#key} forces a remount of the
  // form even when the new drawer has the same `kind` as the previous one —
  // otherwise Svelte reuses the form component instance and the user's
  // typed-in field values silently survive a confirmed "discard".
  type DrawerState =
    | { kind: 'closed' }
    | { kind: 'site'; nonce: number; point: { lon: number; lat: number } | null }
    | { kind: 'sighting'; nonce: number; point: { lon: number; lat: number } | null };

  let drawer = $state<DrawerState>({ kind: 'closed' });
  let drawerNonce = 0;

  function closeDrawer() {
    drawer = { kind: 'closed' };
  }

  /**
   * Confirm before swapping or overwriting a drawer that already holds an
   * in-progress form. Returns true if the caller may proceed.
   *
   * Phase-1B will replace this with a proper unsaved-changes tracker; for now
   * the worst case is "user types a site, then clicks the map / Sightings
   * button and loses input silently". A confirm dialog is the cheap mitigation.
   */
  function mayReplaceDrawer(): boolean {
    if (drawer.kind === 'closed') return true;
    return confirm('Discard the currently open form?');
  }

  function startCreateSite() {
    if (!mayReplaceDrawer()) return;
    drawer = { kind: 'site', nonce: ++drawerNonce, point: null };
  }

  function startCreateSighting() {
    if (!mayReplaceDrawer()) return;
    drawer = { kind: 'sighting', nonce: ++drawerNonce, point: null };
  }

  function onMapClick(ll: { lon: number; lat: number }) {
    // Map-click is a low-friction action; if a drawer is already open, we
    // ignore the click rather than nag the user with a confirm. They can
    // close the drawer themselves and re-click. This preserves form state.
    if (drawer.kind !== 'closed') return;
    drawer = { kind: 'sighting', nonce: ++drawerNonce, point: ll };
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
  canCreateSite={data.canCreateSite}
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
    {#key drawer.nonce}
      <SiteForm
        orgSlug={data.organization.slug}
        opSlug={data.operation.slug}
        initialPoint={drawer.point}
        onClose={closeDrawer}
      />
    {/key}
  {:else if drawer.kind === 'sighting'}
    {#key drawer.nonce}
      <SightingForm
        orgSlug={data.organization.slug}
        opSlug={data.operation.slug}
        initialPoint={drawer.point}
        onClose={closeDrawer}
      />
    {/key}
  {/if}
</DossierDrawer>
