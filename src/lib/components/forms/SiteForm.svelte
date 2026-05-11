<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import type { CreateSitePayload, SiteCreateResponse } from '$lib/types/api';

  type Props = {
    orgSlug: string;
    opSlug: string;
    initialPoint?: { lon: number; lat: number } | null;
    onClose: () => void;
    /**
     * Optional integration with the page-level map-pick bus. When provided,
     * a "Pick from map" button is rendered and clicking it puts the map
     * into pick-mode; the next map click resolves the callback with the
     * chosen lon/lat. Forms with no parent pick bus simply hide the button.
     */
    onRequestPickFromMap?: (cb: (ll: { lon: number; lat: number }) => void) => void;
  };

  let { orgSlug, opSlug, initialPoint = null, onClose, onRequestPickFromMap }: Props = $props();

  // Soft-enumerated kinds. The DB column is free text; this list is what the
  // form proposes today. Extend without a migration.
  const SITE_KINDS = [
    { value: 'feeding_station', label: 'Feeding station' },
    { value: 'colony', label: 'Colony' },
    { value: 'shelter', label: 'Shelter' },
    { value: 'incident', label: 'Incident' },
    { value: 'other', label: 'Other' }
  ];

  let name = $state('');
  let kind = $state<string>(SITE_KINDS[0]?.value ?? 'other');
  // Form fields seed from `initialPoint` once on mount; the user is expected
  // to overwrite them freely from there. A $derived would fight the user's
  // edits whenever the parent re-rendered with the same prop.
  // svelte-ignore state_referenced_locally
  let lon = $state<number | null>(initialPoint?.lon ?? null);
  // svelte-ignore state_referenced_locally
  let lat = $state<number | null>(initialPoint?.lat ?? null);
  let notes = $state('');
  let submitting = $state(false);
  let errorMsg: string | null = $state(null);

  function pickFromMap() {
    onRequestPickFromMap?.((ll) => {
      lon = ll.lon;
      lat = ll.lat;
    });
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (submitting) return;
    submitting = true;
    errorMsg = null;
    try {
      const payload: CreateSitePayload = {
        name: name.trim(),
        kind,
        lon: lon ?? null,
        lat: lat ?? null,
        attributes: notes.trim() ? { notes: notes.trim() } : {}
      };
      const res = await fetch(`/api/o/${orgSlug}/${opSlug}/sites`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        errorMsg = body.message ?? `error_${res.status}`;
        return;
      }
      // Drain the response body once. We don't currently read fields off it.
      // The `await` keeps the connection clean; the cast is unverified by
      // design — fail-by-runtime-error if the server contract drifts.
      (await res.json()) as SiteCreateResponse;
      // Close the drawer FIRST: the resource is already persisted server-side,
      // so if invalidateAll() later rejects (transient nav abort, server load
      // throws) we have already given the user the success signal and avoided
      // the "stale form re-submit → duplicate row" trap.
      onClose();
      try {
        await invalidateAll();
      } catch {
        // Swallow refresh errors: the create succeeded; the UI will pick up
        // the new feature on the next navigation/load.
      }
    } catch {
      errorMsg = 'network_error';
    } finally {
      submitting = false;
    }
  }
</script>

<form class="flex flex-col gap-3 text-sm" onsubmit={submit}>
  <label class="block">
    <span class="text-xs text-neutral-400">Name</span>
    <!-- `aria-invalid` deliberately not bound to `errorMsg`: the message
         may originate from lon/lat/network paths, not Name. The
         `role="alert"` block below announces the error on its own. -->
    <input
      type="text"
      bind:value={name}
      required
      maxlength="200"
      aria-describedby={errorMsg ? 'site-form-error' : undefined}
      class="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-400 focus:outline-none"
    />
  </label>

  <label class="block">
    <span class="text-xs text-neutral-400">Kind</span>
    <select
      bind:value={kind}
      class="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-400 focus:outline-none"
    >
      {#each SITE_KINDS as k (k.value)}
        <option value={k.value}>{k.label}</option>
      {/each}
    </select>
  </label>

  <div class="grid grid-cols-2 gap-2">
    <label class="block">
      <span class="text-xs text-neutral-400">Longitude</span>
      <input
        type="number"
        step="any"
        min="-180"
        max="180"
        bind:value={lon}
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
        bind:value={lat}
        class="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-400 focus:outline-none"
      />
    </label>
  </div>
  {#if onRequestPickFromMap}
    <button
      type="button"
      onclick={pickFromMap}
      class="-mt-1 self-start rounded border border-neutral-700 px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-300 hover:border-amber-400 hover:text-amber-400"
    >
      Pick from map
    </button>
  {/if}

  <label class="block">
    <span class="text-xs text-neutral-400">Notes</span>
    <textarea
      bind:value={notes}
      rows="3"
      maxlength="2000"
      class="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-400 focus:outline-none"
    ></textarea>
  </label>

  {#if errorMsg}
    <p id="site-form-error" class="text-xs text-red-400" role="alert">{errorMsg}</p>
  {/if}

  <div class="flex justify-end gap-2 pt-1">
    <button
      type="button"
      onclick={onClose}
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
