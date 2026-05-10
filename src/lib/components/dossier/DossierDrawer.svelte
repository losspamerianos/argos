<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    open: boolean;
    title?: string;
    onClose: () => void;
    children?: Snippet;
  };
  let { open, title = '', onClose, children }: Props = $props();
</script>

{#if open}
  <aside class="flex w-96 flex-col border-l border-neutral-800 bg-neutral-900/80 text-sm">
    <header class="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-neutral-400">{title}</h2>
      <button
        onclick={onClose}
        class="text-neutral-400 hover:text-neutral-200"
        aria-label="Close">×</button
      >
    </header>
    <div class="flex-1 overflow-y-auto p-3">
      {@render children?.()}
    </div>
  </aside>
{/if}
