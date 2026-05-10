<script lang="ts">
  type Layer = { id: string; label: string; visible: boolean };
  type Props = {
    layers: Layer[];
    onToggle: (id: string) => void;
  };
  let { layers, onToggle }: Props = $props();
</script>

<aside
  class="flex w-64 flex-col gap-2 border-r border-neutral-800 bg-neutral-900/80 p-3 text-sm"
>
  <h2 class="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Layers</h2>
  {#each layers as l (l.id)}
    <label class="flex items-center gap-2">
      <input type="checkbox" checked={l.visible} onchange={() => onToggle(l.id)} />
      <span>{l.label}</span>
    </label>
  {/each}
</aside>
