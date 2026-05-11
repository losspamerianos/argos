<script lang="ts">
  import type { Snippet } from 'svelte';
  import BottomBar from '$lib/components/shell/BottomBar.svelte';

  let { children }: { children: Snippet } = $props();
</script>

<!-- `tabindex="-1"` so DossierDrawer's `<main>` focus-restore fallback (when
     the previously-focused element has been unmounted) can actually land
     focus here — without an explicit tabindex, programmatic focus on a
     `<main>` is a no-op. -->
<main tabindex="-1" class="flex flex-1 overflow-hidden focus:outline-none">
  {@render children()}
</main>

<BottomBar />
