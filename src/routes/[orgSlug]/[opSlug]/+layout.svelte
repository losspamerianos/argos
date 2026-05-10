<script lang="ts">
  import type { Snippet } from 'svelte';
  import BottomBar from '$lib/components/shell/BottomBar.svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="flex flex-1 overflow-hidden">
  {@render children()}
</div>

<BottomBar />
