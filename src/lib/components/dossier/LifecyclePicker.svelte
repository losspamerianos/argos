<script lang="ts" generics="S extends string">
  /**
   * Lifecycle-transition control. Caller supplies the current state, the
   * list of legal next states (machine-derived), and a submit handler. The
   * `S` generic narrows the transition value to the caller's state union so
   * the same component reuses across site / animal / lead machines without
   * losing type-safety on the emitted state.
   *
   * Intentionally **not** doing the network call here — that's the caller's
   * concern. Keeps this component free of fetch-pattern duplication and lets
   * the caller manage drawer/refresh lifecycle around the submit.
   */
  type Props = {
    current: S;
    /** Human label for each state. Caller-supplied so domain stays out of here. */
    labels: Record<S, string>;
    /** Allowed next states. Empty array → terminal-state mode (no picker). */
    next: readonly S[];
    submitting?: boolean;
    onTransition: (to: S) => void;
  };

  let { current, labels, next, submitting = false, onTransition }: Props = $props();

  // First valid next-state seeded once, then kept fresh by the $effect below
  // whenever `next` changes shape (parent updates `current` after a
  // transition without remounting us). Without the effect, `target` would
  // hold a state no longer in the dropdown and the visible `<select>` would
  // be out of sync with the bound value.
  // svelte-ignore state_referenced_locally
  let target = $state<S | ''>(next[0] ?? '');
  $effect(() => {
    if (target === '' || !next.includes(target as S)) {
      target = next[0] ?? '';
    }
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (submitting) return;
    if (target === '' || !next.includes(target as S)) return;
    onTransition(target as S);
  }
</script>

<div class="flex flex-col gap-2">
  <div class="text-xs text-neutral-400">
    Current state:
    <span class="ml-1 font-mono text-amber-400">{labels[current] ?? current}</span>
  </div>
  {#if next.length === 0}
    <p class="text-xs text-neutral-500 italic">Terminal state — no further transitions.</p>
  {:else}
    <form class="flex items-end gap-2" onsubmit={submit}>
      <label class="block flex-1">
        <span class="sr-only">Transition to</span>
        <select
          bind:value={target}
          class="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-100 focus:border-amber-400 focus:outline-none"
        >
          {#each next as state (state)}
            <option value={state}>→ {labels[state] ?? state}</option>
          {/each}
        </select>
      </label>
      <button
        type="submit"
        disabled={submitting || !target}
        class="rounded border border-amber-400 bg-amber-400/10 px-3 py-1.5 text-xs uppercase tracking-wider text-amber-400 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? '…' : 'Apply'}
      </button>
    </form>
  {/if}
</div>
