<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import type {
    Feature,
    SightingFeatureProperties,
    SiteFeatureProperties,
    FeatureCollection,
    SightingReadResponse,
    SightingUpdateResponse,
    UpdateSightingPayload
  } from '$lib/types/api';

  type Props = {
    orgSlug: string;
    opSlug: string;
    sightingId: string;
    /** Coordinator/data_manager/admin → true. Observer → false (read-only). */
    canEdit: boolean;
    /**
     * Sites in this op, used to render the site-link dropdown in edit mode.
     * Passed in rather than fetched here so the parent's already-loaded
     * `data.sites` is reused.
     */
    siteFeatures: FeatureCollection<SiteFeatureProperties>;
    onClose: () => void;
    onRequestPickFromMap?: (cb: (ll: { lon: number; lat: number }) => void) => void;
    /** See SiteDossier for the rationale. */
    onCancelPickFromMap?: () => void;
  };

  let {
    orgSlug,
    opSlug,
    sightingId,
    canEdit,
    siteFeatures,
    onClose,
    onRequestPickFromMap,
    onCancelPickFromMap
  }: Props = $props();

  type Mode = 'loading' | 'view' | 'edit' | 'error';
  let mode = $state<Mode>('loading');
  let errorMsg: string | null = $state(null);
  let sighting = $state<Feature<SightingFeatureProperties> | null>(null);

  // Edit-mode mirrors.
  let editTs = $state(''); // `datetime-local` string
  let editLon = $state<number | null>(null);
  let editLat = $state<number | null>(null);
  // `''` is the "no site" sentinel for the <select>; the wire shape uses null.
  let editSiteId = $state<string>('');
  let editDescription = $state('');
  let submitting = $state(false);
  let deleting = $state(false);

  // Field-gated aria-describedby — same pattern as SiteDossier. No
  // `attr` flag because this component has no attributes input today;
  // attribute-shape errors from a hand-rolled API call would surface
  // through the global `role="alert"` block.
  const TS_ERROR_CODES = ['invalid_ts'];
  const LOCATION_ERROR_CODES = ['invalid_lon', 'invalid_lat', 'incomplete_point'];
  const SITE_ERROR_CODES = ['invalid_site_id', 'site_not_in_operation'];
  const DESC_ERROR_CODES = ['invalid_description', 'description_too_long'];
  const tsError = $derived(errorMsg !== null && TS_ERROR_CODES.includes(errorMsg));
  const locationError = $derived(
    errorMsg !== null && LOCATION_ERROR_CODES.includes(errorMsg)
  );
  const siteError = $derived(errorMsg !== null && SITE_ERROR_CODES.includes(errorMsg));
  const descError = $derived(errorMsg !== null && DESC_ERROR_CODES.includes(errorMsg));

  // Single lookup table from siteId → display label. Built once per
  // `siteFeatures` prop change (O(N)) and reused by `siteOptions`,
  // `siteLabel`, and the orphaned-id check. Avoids the O(N²) repeated
  // linear search the previous shape implied.
  const siteLookup = $derived(
    new Map(
      siteFeatures.features.map((f) => [f.id, `${f.properties.name} (${f.properties.kind})`])
    )
  );
  const siteOptions = $derived(
    [...siteLookup.entries()].map(([id, label]) => ({ id, label }))
  );

  function siteLabel(id: string | null): string {
    if (!id) return '—';
    return siteLookup.get(id) ?? id;
  }

  /**
   * True when the row's persisted `editSiteId` is not in the visible
   * `siteOptions` (deleted site, cross-op leftover, or stale features
   * collection). The edit-mode dropdown adds a synthetic disabled
   * option so `bind:value` keeps the id and a save-without-changes
   * doesn't silently null the link.
   */
  const editSiteIsOrphaned = $derived(
    editSiteId !== '' && !siteLookup.has(editSiteId)
  );

  /**
   * Format an ISO timestamp into the `YYYY-MM-DDTHH:mm` shape the
   * `datetime-local` input requires. Uses LOCAL components so the user
   * sees the time in their browser tz; on submit we round-trip back to
   * an absolute ISO via `new Date(...)`. Year is padded to 4 digits so
   * a < year-1000 value (only reachable via corrupt seed data) still
   * matches `datetime-local`'s lexical format.
   */
  function isoToLocalInput(iso: string): string {
    const d = new Date(iso);
    const pad2 = (n: number) => n.toString().padStart(2, '0');
    const year = d.getFullYear().toString().padStart(4, '0');
    return `${year}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  async function load() {
    mode = 'loading';
    errorMsg = null;
    try {
      const res = await fetch(`/api/o/${orgSlug}/${opSlug}/sightings/${sightingId}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        errorMsg = body.message ?? `error_${res.status}`;
        mode = 'error';
        return;
      }
      const data = (await res.json()) as SightingReadResponse;
      sighting = data.sighting;
      mode = 'view';
    } catch {
      errorMsg = 'network_error';
      mode = 'error';
    }
  }

  onMount(load);

  function startEdit() {
    if (!sighting) return;
    editTs = isoToLocalInput(sighting.properties.ts);
    editLon = sighting.geometry?.coordinates?.[0] ?? null;
    editLat = sighting.geometry?.coordinates?.[1] ?? null;
    editSiteId = sighting.properties.siteId ?? '';
    editDescription = sighting.properties.description ?? '';
    errorMsg = null;
    mode = 'edit';
  }

  function cancelEdit() {
    errorMsg = null;
    onCancelPickFromMap?.();
    mode = 'view';
  }

  function pickFromMap() {
    onRequestPickFromMap?.((ll) => {
      editLon = ll.lon;
      editLat = ll.lat;
    });
  }

  async function saveEdit(e: SubmitEvent) {
    e.preventDefault();
    if (submitting) return;
    submitting = true;
    errorMsg = null;
    try {
      // datetime-local → absolute ISO. An empty input means "leave ts
      // alone" — `sightings.ts` is NOT NULL on the column (see
      // schema/events.ts), so PATCHing `null` would surface as a 500.
      // We omit the field from the payload instead; the partial-update
      // validator preserves the existing column value.
      const payload: UpdateSightingPayload = {
        lon: editLon,
        lat: editLat,
        siteId: editSiteId === '' ? null : editSiteId,
        description: editDescription.trim() ? editDescription.trim() : null
      };
      if (editTs) {
        const parsed = new Date(editTs);
        if (!Number.isFinite(parsed.getTime())) {
          errorMsg = 'invalid_ts';
          return;
        }
        payload.ts = parsed.toISOString();
      }
      const res = await fetch(`/api/o/${orgSlug}/${opSlug}/sightings/${sightingId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        errorMsg = body.message ?? `error_${res.status}`;
        return;
      }
      const data = (await res.json()) as SightingUpdateResponse;
      sighting = data.sighting;
      onCancelPickFromMap?.();
      mode = 'view';
      try {
        await invalidateAll();
      } catch {
        // refresh failure is non-fatal; the PATCH already succeeded
      }
    } catch {
      errorMsg = 'network_error';
    } finally {
      submitting = false;
    }
  }

  async function doDelete() {
    if (deleting) return;
    if (!confirm('Delete this sighting? This cannot be undone.')) return;
    deleting = true;
    errorMsg = null;
    try {
      const res = await fetch(`/api/o/${orgSlug}/${opSlug}/sightings/${sightingId}`, {
        method: 'DELETE'
      });
      // 204 = we deleted it. 404 = somebody else already did. Either way
      // the row is gone, so treat both as success and refresh the map.
      if (!res.ok && res.status !== 204 && res.status !== 404) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        errorMsg = body.message ?? `error_${res.status}`;
        return;
      }
      // Close drawer FIRST so the user sees the success signal, then
      // refresh. Same pattern as SiteForm's save-and-close.
      onClose();
      try {
        await invalidateAll();
      } catch {
        // ignore
      }
    } catch {
      errorMsg = 'network_error';
    } finally {
      deleting = false;
    }
  }
</script>

<div class="flex flex-col gap-4 text-sm">
  {#if mode === 'loading'}
    <p class="text-xs text-neutral-500">Loading sighting…</p>
  {:else if mode === 'error'}
    <p id="sighting-dossier-error-load" class="text-xs text-red-400" role="alert">
      {errorMsg}
    </p>
    <button
      type="button"
      onclick={load}
      class="self-start rounded border border-neutral-700 px-3 py-1 text-xs uppercase tracking-wider text-neutral-300 hover:border-neutral-500"
    >
      Retry
    </button>
  {:else if mode === 'view' && sighting}
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      <dt class="text-neutral-500">When</dt>
      <dd class="font-mono text-neutral-100">
        {new Date(sighting.properties.ts).toLocaleString()}
      </dd>
      {#if sighting.geometry}
        <dt class="text-neutral-500">Lon / Lat</dt>
        <dd class="font-mono text-neutral-100">
          {sighting.geometry.coordinates[0].toFixed(5)},
          {sighting.geometry.coordinates[1].toFixed(5)}
        </dd>
      {/if}
      <dt class="text-neutral-500">Site</dt>
      <dd class="text-neutral-100">{siteLabel(sighting.properties.siteId)}</dd>
      {#if sighting.properties.description}
        <dt class="text-neutral-500">Notes</dt>
        <dd class="whitespace-pre-wrap text-neutral-100">
          {sighting.properties.description}
        </dd>
      {/if}
    </dl>

    {#if errorMsg}
      <p id="sighting-dossier-error-view" class="text-xs text-red-400" role="alert">
        {errorMsg}
      </p>
    {/if}

    {#if canEdit}
      <div class="flex justify-end gap-2">
        <button
          type="button"
          onclick={doDelete}
          disabled={deleting}
          class="rounded border border-red-500 px-3 py-1 text-xs uppercase tracking-wider text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
        <button
          type="button"
          onclick={startEdit}
          class="rounded border border-neutral-700 px-3 py-1 text-xs uppercase tracking-wider text-neutral-300 hover:border-neutral-500"
        >
          Edit
        </button>
        <button
          type="button"
          onclick={onClose}
          class="rounded border border-neutral-700 px-3 py-1 text-xs uppercase tracking-wider text-neutral-300 hover:border-neutral-500"
        >
          Close
        </button>
      </div>
    {:else}
      <div class="flex justify-end">
        <button
          type="button"
          onclick={onClose}
          class="rounded border border-neutral-700 px-3 py-1 text-xs uppercase tracking-wider text-neutral-300 hover:border-neutral-500"
        >
          Close
        </button>
      </div>
    {/if}
  {:else if mode === 'edit'}
    <form class="flex flex-col gap-3" onsubmit={saveEdit}>
      <label class="block">
        <span class="text-xs text-neutral-400">When</span>
        <input
          type="datetime-local"
          bind:value={editTs}
          aria-describedby={tsError ? 'sighting-dossier-error-edit' : undefined}
          class="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-400 focus:outline-none"
        />
      </label>
      <div class="grid grid-cols-2 gap-2">
        <label class="block">
          <span class="text-xs text-neutral-400">Longitude</span>
          <input
            type="number"
            step="any"
            min="-180"
            max="180"
            bind:value={editLon}
            aria-describedby={locationError ? 'sighting-dossier-error-edit' : undefined}
            class="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-400 focus:outline-none"
          />
        </label>
        <label class="block">
          <span class="text-xs text-neutral-400">Latitude</span>
          <input
            type="number"
            step="any"
            min="-90"
            max="90"
            bind:value={editLat}
            aria-describedby={locationError ? 'sighting-dossier-error-edit' : undefined}
            class="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-400 focus:outline-none"
          />
        </label>
      </div>
      {#if onRequestPickFromMap}
        <button
          type="button"
          onclick={pickFromMap}
          class="-mt-2 self-start rounded border border-neutral-700 px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-300 hover:border-amber-400 hover:text-amber-400"
        >
          Pick from map
        </button>
      {/if}
      <label class="block">
        <span class="text-xs text-neutral-400">Site</span>
        <select
          bind:value={editSiteId}
          aria-describedby={siteError ? 'sighting-dossier-error-edit' : undefined}
          class="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-400 focus:outline-none"
        >
          <option value="">— No site —</option>
          {#each siteOptions as opt (opt.id)}
            <option value={opt.id}>{opt.label}</option>
          {/each}
          {#if editSiteIsOrphaned}
            <!-- Persisted siteId is not in the current siteFeatures list
                 (deleted, in another op, or features still loading). Show
                 a disabled option so the bound value round-trips and the
                 user doesn't accidentally clear the link by hitting Save. -->
            <option value={editSiteId} disabled>
              Unknown site ({editSiteId.slice(0, 8)}…)
            </option>
          {/if}
        </select>
      </label>
      <label class="block">
        <span class="text-xs text-neutral-400">Notes</span>
        <textarea
          bind:value={editDescription}
          rows="3"
          maxlength="4000"
          aria-describedby={descError ? 'sighting-dossier-error-edit' : undefined}
          class="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-400 focus:outline-none"
        ></textarea>
      </label>

      {#if errorMsg}
        <p id="sighting-dossier-error-edit" class="text-xs text-red-400" role="alert">
          {errorMsg}
        </p>
      {/if}

      <div class="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onclick={cancelEdit}
          class="rounded border border-neutral-700 px-3 py-1 text-xs uppercase tracking-wider text-neutral-300 hover:border-neutral-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          class="rounded border border-amber-400 bg-amber-400/10 px-3 py-1 text-xs uppercase tracking-wider text-amber-400 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  {/if}
</div>
