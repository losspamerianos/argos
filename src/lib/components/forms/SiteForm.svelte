<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import type { CreateSitePayload, SiteCreateResponse } from '$lib/types/api';

  type Props = {
    orgSlug: string;
    opSlug: string;
    initialPoint?: { lon: number; lat: number } | null;
    onClose: () => void;
  };

  let { orgSlug, opSlug, initialPoint = null, onClose }: Props = $props();

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
      // Type-narrow the response shape (we don't read fields here, just confirm
      // the wire contract; future: surface the new feature ID for selection).
      (await res.json()) as SiteCreateResponse;
      await invalidateAll();
      onClose();
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
    <input
      type="text"
      bind:value={name}
      required
      maxlength="200"
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
    <p class="text-xs text-red-400" role="alert">{errorMsg}</p>
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
