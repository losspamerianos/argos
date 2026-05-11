<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import LifecyclePicker from './LifecyclePicker.svelte';
  import { siteMachine } from '$lib/shared/lifecycle/site';
  import { nextStates } from '$lib/shared/lifecycle/machine';
  import type {
    Feature,
    SiteFeatureProperties,
    SiteReadResponse,
    SiteUpdateResponse,
    SiteTransitionResponse,
    UpdateSitePayload,
    SiteLifecycleState
  } from '$lib/types/api';

  type Props = {
    orgSlug: string;
    opSlug: string;
    siteId: string;
    /** Coordinator/data_manager/admin → true. Observer → false (read-only). */
    canEdit: boolean;
    onClose: () => void;
    onRequestPickFromMap?: (cb: (ll: { lon: number; lat: number }) => void) => void;
    /**
     * Companion to `onRequestPickFromMap`. Called from mode transitions
     * that abandon edit context without closing the drawer (cancel-edit,
     * save-edit success → view), so the parent can drop any in-flight
     * pick resolver whose closure now writes into unreachable state.
     */
    onCancelPickFromMap?: () => void;
  };

  let {
    orgSlug,
    opSlug,
    siteId,
    canEdit,
    onClose,
    onRequestPickFromMap,
    onCancelPickFromMap
  }: Props = $props();

  // Labels are UI-only metadata; the machine itself is the canonical
  // transition data, imported from `$lib/shared/lifecycle/site`. Both the
  // server-side API enforcement (`siteMachine` + `canTransition`) and this
  // picker consume the same object, so the dropdown can never offer a
  // transition the server would reject for being structurally illegal.
  const STATE_LABELS: Record<SiteLifecycleState, string> = {
    discovered: 'Discovered',
    assessed: 'Assessed',
    in_sanitation: 'In sanitation',
    at_threshold: 'At threshold',
    in_hold: 'In hold',
    handed_over: 'Handed over',
    archived: 'Archived'
  };

  type Mode = 'loading' | 'view' | 'edit' | 'error';
  let mode = $state<Mode>('loading');
  let errorMsg: string | null = $state(null);
  let site = $state<Feature<SiteFeatureProperties> | null>(null);

  // Field-gated aria-describedby: route the error-message DOM link only to
  // the input whose value caused it. Generic errors (network, rate_limited,
  // forbidden, no_fields_to_update) intentionally do not gate any input —
  // the `role="alert"` on the error <p> announces them globally so SR
  // users still hear them.
  const NAME_ERROR_CODES = ['invalid_name'];
  const KIND_ERROR_CODES = ['invalid_kind'];
  const LOCATION_ERROR_CODES = [
    'invalid_lon',
    'invalid_lat',
    'incomplete_point'
  ];
  const ATTR_ERROR_CODES = [
    'invalid_attributes',
    'attributes_too_many_keys',
    'attributes_too_large',
    'attributes_too_deep',
    'forbidden_attribute_key',
    'attribute_key_too_long'
  ];
  const nameError = $derived(errorMsg !== null && NAME_ERROR_CODES.includes(errorMsg));
  const kindError = $derived(errorMsg !== null && KIND_ERROR_CODES.includes(errorMsg));
  const locationError = $derived(
    errorMsg !== null && LOCATION_ERROR_CODES.includes(errorMsg)
  );
  const attrError = $derived(errorMsg !== null && ATTR_ERROR_CODES.includes(errorMsg));

  // Edit-mode mirrors of the site fields — seeded from `site` when the user
  // enters edit-mode and only flushed back via PATCH on save.
  let editName = $state('');
  let editKind = $state('');
  let editLon = $state<number | null>(null);
  let editLat = $state<number | null>(null);
  let editNotes = $state('');
  let submitting = $state(false);
  let transitionRunning = $state(false);

  async function load() {
    mode = 'loading';
    errorMsg = null;
    try {
      const res = await fetch(`/api/o/${orgSlug}/${opSlug}/sites/${siteId}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        errorMsg = body.message ?? `error_${res.status}`;
        mode = 'error';
        return;
      }
      const data = (await res.json()) as SiteReadResponse;
      site = data.site;
      mode = 'view';
    } catch {
      errorMsg = 'network_error';
      mode = 'error';
    }
  }

  onMount(load);

  function pickFromMap() {
    onRequestPickFromMap?.((ll) => {
      editLon = ll.lon;
      editLat = ll.lat;
    });
  }

  function startEdit() {
    if (!site) return;
    editName = site.properties.name;
    editKind = site.properties.kind;
    editLon = site.geometry?.coordinates[0] ?? null;
    editLat = site.geometry?.coordinates[1] ?? null;
    const notes = site.properties.attributes?.notes;
    editNotes = typeof notes === 'string' ? notes : '';
    errorMsg = null;
    mode = 'edit';
  }

  function cancelEdit() {
    errorMsg = null;
    // Drop any in-flight map-pick resolver: it captures setters of fields
    // we're about to abandon.
    onCancelPickFromMap?.();
    mode = 'view';
  }

  async function saveEdit(e: SubmitEvent) {
    e.preventDefault();
    if (submitting) return;
    submitting = true;
    errorMsg = null;
    try {
      // Send the full set of editable fields. The server PATCH is partial-
      // friendly: callers that omit a field leave it untouched. We send them
      // all because the user's form represents their intended desired-state.
      const payload: UpdateSitePayload = {
        name: editName.trim(),
        kind: editKind.trim(),
        lon: editLon,
        lat: editLat,
        attributes: editNotes.trim() ? { notes: editNotes.trim() } : {}
      };
      const res = await fetch(`/api/o/${orgSlug}/${opSlug}/sites/${siteId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        errorMsg = body.message ?? `error_${res.status}`;
        return;
      }
      const data = (await res.json()) as SiteUpdateResponse;
      site = data.site;
      // Clear any in-flight pick resolver before the mode flips: after
      // `mode='view'` the edit-mode setters captured in the closure are
      // no longer reachable, so a stray map click would silently do nothing.
      onCancelPickFromMap?.();
      mode = 'view';
      // Refresh map features so the renamed/relocated marker reflects.
      // Errors swallowed: the PATCH succeeded; visible refresh is best-effort.
      try {
        await invalidateAll();
      } catch {
        // ignore
      }
    } catch {
      errorMsg = 'network_error';
    } finally {
      submitting = false;
    }
  }

  async function transition(to: SiteLifecycleState) {
    if (transitionRunning) return;
    transitionRunning = true;
    errorMsg = null;
    try {
      const res = await fetch(`/api/o/${orgSlug}/${opSlug}/sites/${siteId}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        errorMsg = body.message ?? `error_${res.status}`;
        return;
      }
      const data = (await res.json()) as SiteTransitionResponse;
      site = data.site;
      try {
        await invalidateAll();
      } catch {
        // ignore
      }
    } catch {
      errorMsg = 'network_error';
    } finally {
      transitionRunning = false;
    }
  }

  // Derived: the LifecyclePicker's allowed next states, computed from the
  // shared machine. Empty array for terminal states (`archived`). No cast
  // needed: `SiteLifecycleState` is now a re-export of the same `SiteState`
  // alias the machine is generic over.
  const next = $derived(
    site ? nextStates(siteMachine, site.properties.lifecycleState) : []
  );
</script>

<div class="flex flex-col gap-4 text-sm">
  {#if mode === 'loading'}
    <p class="text-xs text-neutral-500">Loading site…</p>
  {:else if mode === 'error'}
    <p id="site-dossier-error-load" class="text-xs text-red-400" role="alert">{errorMsg}</p>
    <button
      type="button"
      onclick={load}
      class="self-start rounded border border-neutral-700 px-3 py-1 text-xs uppercase tracking-wider text-neutral-300 hover:border-neutral-500"
    >
      Retry
    </button>
  {:else if mode === 'view' && site}
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      <dt class="text-neutral-500">Name</dt>
      <dd class="text-neutral-100">{site.properties.name}</dd>
      <dt class="text-neutral-500">Kind</dt>
      <dd class="font-mono text-neutral-100">{site.properties.kind}</dd>
      <dt class="text-neutral-500">State</dt>
      <dd class="font-mono text-amber-400">
        {STATE_LABELS[site.properties.lifecycleState] ?? site.properties.lifecycleState}
      </dd>
      {#if site.geometry}
        <dt class="text-neutral-500">Lon / Lat</dt>
        <dd class="font-mono text-neutral-100">
          {site.geometry.coordinates[0].toFixed(5)},
          {site.geometry.coordinates[1].toFixed(5)}
        </dd>
      {/if}
      {#if typeof site.properties.attributes?.notes === 'string'}
        <dt class="text-neutral-500">Notes</dt>
        <dd class="whitespace-pre-wrap text-neutral-100">
          {site.properties.attributes.notes}
        </dd>
      {/if}
      <dt class="text-neutral-500">Created</dt>
      <dd class="text-neutral-400">{new Date(site.properties.createdAt).toLocaleString()}</dd>
    </dl>

    {#if errorMsg}
      <p id="site-dossier-error-view" class="text-xs text-red-400" role="alert">{errorMsg}</p>
    {/if}

    {#if canEdit}
      <div class="rounded border border-neutral-800 p-2">
        <p class="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">Lifecycle</p>
        <LifecyclePicker
          current={site.properties.lifecycleState}
          labels={STATE_LABELS}
          {next}
          submitting={transitionRunning}
          onTransition={transition}
        />
      </div>
      <div class="flex justify-end gap-2">
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
        <span class="text-xs text-neutral-400">Name</span>
        <input
          type="text"
          bind:value={editName}
          required
          maxlength="200"
          aria-describedby={nameError ? 'site-dossier-error-edit' : undefined}
          class="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-400 focus:outline-none"
        />
      </label>
      <label class="block">
        <span class="text-xs text-neutral-400">Kind</span>
        <input
          type="text"
          bind:value={editKind}
          required
          pattern="[a-z0-9_-]{'{'}1,64{'}'}"
          maxlength="64"
          aria-describedby={kindError ? 'site-dossier-error-edit' : undefined}
          class="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-neutral-100 focus:border-amber-400 focus:outline-none"
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
            aria-describedby={locationError ? 'site-dossier-error-edit' : undefined}
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
            aria-describedby={locationError ? 'site-dossier-error-edit' : undefined}
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
        <span class="text-xs text-neutral-400">Notes</span>
        <textarea
          bind:value={editNotes}
          rows="3"
          maxlength="2000"
          aria-describedby={attrError ? 'site-dossier-error-edit' : undefined}
          class="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-400 focus:outline-none"
        ></textarea>
      </label>

      {#if errorMsg}
        <p id="site-dossier-error-edit" class="text-xs text-red-400" role="alert">{errorMsg}</p>
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
