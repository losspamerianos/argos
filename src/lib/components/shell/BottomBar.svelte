<script lang="ts">
  type Props = {
    leadCount?: number;
    activeTrapPlans?: number;
    earclipRate?: number | null;
  };
  let { leadCount = 0, activeTrapPlans = 0, earclipRate = null }: Props = $props();
</script>

<footer
  class="flex items-center gap-6 border-t border-neutral-800 bg-neutral-900 px-4 py-2 text-xs text-neutral-400"
>
  <span>Leads: <span class="text-neutral-100">{leadCount}</span></span>
  <span>Active TrapPlans: <span class="text-neutral-100">{activeTrapPlans}</span></span>
  {#if earclipRate !== null}
    <span>Earclip: <span class="text-neutral-100">{Math.round(earclipRate * 100)}%</span></span>
  {/if}
</footer>
