<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<main class="flex flex-1 items-center justify-center p-8">
  <div class="w-full max-w-md">
    <h1 class="font-mono text-2xl uppercase tracking-widest text-amber-400">ARGOS</h1>
    <p class="mt-2 text-sm text-neutral-400">
      Animal Registry &amp; Geographical Operations System
    </p>

    <h2
      class="mt-8 mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400"
    >
      Operations
    </h2>
    <ul class="space-y-2">
      {#each data.operations as op (op.slug)}
        <li>
          <a
            class="block rounded border border-neutral-800 px-4 py-3 transition hover:border-amber-400"
            href="/op/{op.slug}"
          >
            {op.name}
          </a>
        </li>
      {:else}
        <li class="text-sm text-neutral-500">No operations configured yet.</li>
      {/each}
    </ul>
  </div>
</main>
