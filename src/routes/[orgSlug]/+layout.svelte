<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="flex flex-1 flex-col overflow-hidden">
  {@render children()}
</div>
