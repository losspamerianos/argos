<script lang="ts">
  import MapShell, {
    type LayerKey,
    type LayerVisibility,
    type FeatureClickKind
  } from '$lib/components/map/MapShell.svelte';
  import LayerPanel from '$lib/components/map/LayerPanel.svelte';
  import DossierDrawer from '$lib/components/dossier/DossierDrawer.svelte';
  import SiteForm from '$lib/components/forms/SiteForm.svelte';
  import SightingForm from '$lib/components/forms/SightingForm.svelte';
  import SiteDossier from '$lib/components/dossier/SiteDossier.svelte';
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
    | { kind: 'sighting'; nonce: number; point: { lon: number; lat: number } | null }
    | { kind: 'site-dossier'; nonce: number; siteId: string };

  let drawer = $state<DrawerState>({ kind: 'closed' });
  let drawerNonce = 0;

  function closeDrawer() {
    // Drop any in-flight map-pick resolver too: it would otherwise capture
    // setters of the now-unmounted form, leaving the pick banner stuck on
    // screen and the next map click no-oping into a dead component.
    pickResolver = null;
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
    // Any in-flight pick resolver belonged to the previous drawer; the user
    // just confirmed they're discarding that form. Without this, the banner
    // would persist and the next map click would no-op into the unmounted
    // form (the bug closeDrawer fixed — same root cause, swap path was
    // missed in the first pass).
    pickResolver = null;
    drawer = { kind: 'site', nonce: ++drawerNonce, point: null };
  }

  function startCreateSighting() {
    if (!mayReplaceDrawer()) return;
    pickResolver = null;
    drawer = { kind: 'sighting', nonce: ++drawerNonce, point: null };
  }

  // Map-pick bus: when a form/dossier wants to ask the user for a lon/lat
  // via the map, it registers a callback here. The next map click consumes
  // the callback and feeds the coordinate into the form. Single-shot —
  // resolver is cleared on click or on cancel. Holding the resolver in
  // page-level state means the form component's own $state survives
  // (no remount), which preserves the user's other typed-in fields.
  type PickResolver = (ll: { lon: number; lat: number }) => void;
  let pickResolver = $state<PickResolver | null>(null);
  const picking = $derived(pickResolver !== null);

  function requestPickFromMap(cb: PickResolver) {
    pickResolver = cb;
  }
  function cancelPickFromMap() {
    pickResolver = null;
  }

  // Global Escape handler scoped to pick-mode: lets the user back out of a
  // pick without finding the banner's Cancel button. Runs in capture-phase
  // so it claims the keystroke before the DossierDrawer's Escape handler,
  // which would otherwise close the drawer instead of just cancelling pick.
  $effect(() => {
    if (!picking) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      cancelPickFromMap();
    }
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  });

  function onMapClick(ll: { lon: number; lat: number }) {
    // Picking takes precedence over everything else.
    if (pickResolver) {
      const cb = pickResolver;
      pickResolver = null;
      cb(ll);
      return;
    }
    // Map-click is a low-friction action; if a drawer is already open, we
    // ignore the click rather than nag the user with a confirm. They can
    // close the drawer themselves and re-click. This preserves form state.
    if (drawer.kind !== 'closed') return;
    drawer = { kind: 'sighting', nonce: ++drawerNonce, point: ll };
  }

  function onFeatureClick(f: { kind: FeatureClickKind; id: string }) {
    // While picking, feature-clicks are absorbed as map clicks (the user
    // wants the click's coordinate, not to open another dossier). MapShell
    // emits onFeatureClick only when a layer is hit, so we need to bridge.
    if (pickResolver) return; // map's own click handler delivers the coord
    if (f.kind === 'site') {
      // SiteDossier owns an Edit mode now (Phase 1B), so swapping the drawer
      // can silently discard an in-progress edit / form. Confirm with the
      // user first, mirroring `startCreate*`. Sighting-dossier comes in a
      // later sprint; ignore those clicks for now.
      if (!mayReplaceDrawer()) return;
      pickResolver = null;
      drawer = { kind: 'site-dossier', nonce: ++drawerNonce, siteId: f.id };
    }
  }

  const drawerTitle = $derived(
    drawer.kind === 'site'
      ? 'New site'
      : drawer.kind === 'sighting'
        ? 'New sighting'
        : drawer.kind === 'site-dossier'
          ? 'Site'
          : ''
  );
</script>

<LayerPanel
  {layers}
  onToggle={toggleLayer}
  onCreateSite={startCreateSite}
  onCreateSighting={startCreateSighting}
  canCreateSite={data.canManageSites}
/>
<div class="relative flex-1">
  <MapShell
    {center}
    {zoom}
    aoPolygon={data.operation.aoPolygon}
    siteFeatures={data.sites}
    sightingFeatures={data.sightings}
    {layerVisibility}
    {onMapClick}
    {onFeatureClick}
    pickMode={picking}
  />
  {#if picking}
    <!-- Small banner over the map so the user can see + cancel pick mode. -->
    <div
      class="pointer-events-none absolute inset-x-0 top-2 z-50 flex justify-center"
    >
      <!-- `role="status"` + `aria-live="polite"` announces the pick-mode
           cue to screen readers when the form's "Pick from map" button is
           pressed. `polite` queues the announcement after the current
           speech, which suits an informational hint. -->
      <div
        role="status"
        aria-live="polite"
        class="pointer-events-auto flex items-center gap-3 rounded border border-amber-400 bg-neutral-900/90 px-3 py-1.5 text-xs text-amber-400 shadow"
      >
        <span>Click anywhere on the map to set the position. <kbd class="ml-1 rounded border border-neutral-700 px-1 text-[10px] text-neutral-400">Esc</kbd> to cancel.</span>
        <button
          type="button"
          onclick={cancelPickFromMap}
          class="rounded border border-neutral-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-neutral-300 hover:border-neutral-500"
        >
          Cancel
        </button>
      </div>
    </div>
  {/if}
</div>
<DossierDrawer open={drawer.kind !== 'closed'} title={drawerTitle} onClose={closeDrawer}>
  {#if drawer.kind === 'site'}
    {#key drawer.nonce}
      <SiteForm
        orgSlug={data.organization.slug}
        opSlug={data.operation.slug}
        initialPoint={drawer.point}
        onClose={closeDrawer}
        onRequestPickFromMap={requestPickFromMap}
      />
    {/key}
  {:else if drawer.kind === 'sighting'}
    {#key drawer.nonce}
      <SightingForm
        orgSlug={data.organization.slug}
        opSlug={data.operation.slug}
        initialPoint={drawer.point}
        onClose={closeDrawer}
        onRequestPickFromMap={requestPickFromMap}
      />
    {/key}
  {:else if drawer.kind === 'site-dossier'}
    {#key drawer.nonce}
      <SiteDossier
        orgSlug={data.organization.slug}
        opSlug={data.operation.slug}
        siteId={drawer.siteId}
        canEdit={data.canManageSites}
        onClose={closeDrawer}
        onRequestPickFromMap={requestPickFromMap}
        onCancelPickFromMap={cancelPickFromMap}
      />
    {/key}
  {/if}
</DossierDrawer>
