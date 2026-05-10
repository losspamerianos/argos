<script lang="ts">
  type Layer = { id: string; label: string; visible: boolean };
  type Props = {
    layers: Layer[];
    onToggle: (id: string) => void;
    /** When supplied, render quick-add buttons at the top of the panel. */
    onCreateSite?: () => void;
    onCreateSighting?: () => void;
    /** Hides the create-site button when the user lacks the role. */
    canCreateSite?: boolean;
  };
  let {
    layers,
    onToggle,
    onCreateSite,
    onCreateSighting,
    canCreateSite = true
  }: Props = $props();
</script>

<aside
  class="flex w-64 flex-col gap-2 border-r border-neutral-800 bg-neutral-900/80 p-3 text-sm"
>
  {#if onCreateSite || onCreateSighting}
    <div class="mb-2 flex flex-col gap-2">
      {#if onCreateSite && canCreateSite}
        <button
          type="button"
          onclick={onCreateSite}
          class="rounded border border-amber-400/60 bg-amber-400/10 px-2 py-1 text-left text-xs uppercase tracking-wider text-amber-300 transition hover:bg-amber-400/20"
        >
          + Site
        </button>
      {/if}
      {#if onCreateSighting}
        <button
          type="button"
          onclick={onCreateSighting}
          class="rounded border border-neutral-700 px-2 py-1 text-left text-xs uppercase tracking-wider text-neutral-300 transition hover:border-neutral-500"
        >
          + Sighting
        </button>
      {/if}
    </div>
  {/if}
  <h2 class="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Layers</h2>
  {#each layers as l (l.id)}
    <label class="flex items-center gap-2">
      <input type="checkbox" checked={l.visible} onchange={() => onToggle(l.id)} />
      <span>{l.label}</span>
    </label>
  {/each}
</aside>
