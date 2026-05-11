<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import type { CreateSightingPayload, SightingCreateResponse } from '$lib/types/api';

  type Props = {
    orgSlug: string;
    opSlug: string;
    initialPoint?: { lon: number; lat: number } | null;
    onClose: () => void;
    onRequestPickFromMap?: (cb: (ll: { lon: number; lat: number }) => void) => void;
  };

  let {
    orgSlug,
    opSlug,
    initialPoint = null,
    onClose,
    onRequestPickFromMap
  }: Props = $props();

  // datetime-local wants `YYYY-MM-DDTHH:mm` in *local* time. We normalise on
  // submit by converting back to ISO via Date.
  function nowLocalForInput(): string {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  let tsLocal = $state(nowLocalForInput());
  // Seed once on mount from `initialPoint`; the user edits freely thereafter.
  // svelte-ignore state_referenced_locally
  let lon = $state<number | null>(initialPoint?.lon ?? null);
  // svelte-ignore state_referenced_locally
  let lat = $state<number | null>(initialPoint?.lat ?? null);
  let description = $state('');
  let submitting = $state(false);
  let errorMsg: string | null = $state(null);

  function pickFromMap() {
    onRequestPickFromMap?.((ll) => {
      lon = ll.lon;
      lat = ll.lat;
    });
  }

  // aria-invalid on lon/lat should only fire for location-relevant errors;
  // a `invalid_ts` should not flag the coordinate inputs to a screen reader.
  const LOCATION_ERROR_CODES = ['location_required', 'invalid_lon', 'invalid_lat', 'invalid_point'];
  const locationInvalid = $derived(errorMsg !== null && LOCATION_ERROR_CODES.includes(errorMsg));

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (submitting) return;
    submitting = true;
    errorMsg = null;
    try {
      // Convert local datetime input to ISO. Empty input falls back to now()
      // server-side via the optional ts field.
      let tsIso: string | null = null;
      if (tsLocal) {
        const parsed = new Date(tsLocal);
        if (!Number.isFinite(parsed.getTime())) {
          errorMsg = 'invalid_ts';
          return;
        }
        tsIso = parsed.toISOString();
      }

      // Sightings must carry a location: the whole point of recording them in
      // a map-first system is to support spatial analysis (clustering, sweep
      // planning). The API also allows null for programmatic callers, but the
      // human-facing form rejects it.
      if (lon === null || lon === undefined || lat === null || lat === undefined) {
        errorMsg = 'location_required';
        return;
      }

      const payload: CreateSightingPayload = {
        ts: tsIso,
        lon,
        lat,
        description: description.trim() ? description.trim() : null,
        attributes: {}
      };
      const res = await fetch(`/api/o/${orgSlug}/${opSlug}/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        errorMsg = body.message ?? `error_${res.status}`;
        return;
      }
      // Drain the response body once. See SiteForm for the rationale on the
      // close-before-invalidate ordering.
      (await res.json()) as SightingCreateResponse;
      onClose();
      try {
        await invalidateAll();
      } catch {
        // Swallow refresh errors: the create succeeded.
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
    <span class="text-xs text-neutral-400">When</span>
    <input
      type="datetime-local"
      bind:value={tsLocal}
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
        bind:value={lon}
        required
        aria-invalid={locationInvalid || undefined}
        aria-describedby={locationInvalid ? 'sighting-form-error' : undefined}
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
        required
        aria-invalid={locationInvalid || undefined}
        aria-describedby={locationInvalid ? 'sighting-form-error' : undefined}
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
    <span class="text-xs text-neutral-400">Description</span>
    <textarea
      bind:value={description}
      rows="3"
      maxlength="4000"
      placeholder="3 cats near the bin, one with right ear-clip"
      class="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-400 focus:outline-none"
    ></textarea>
  </label>

  {#if errorMsg}
    <p id="sighting-form-error" class="text-xs text-red-400" role="alert">{errorMsg}</p>
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
