<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<main class="flex flex-1 items-center justify-center p-8">
  <div class="w-full max-w-md">
    <a class="text-xs text-neutral-500 hover:text-neutral-300" href="/">← All organizations</a>
    <h1 class="mt-1 text-xl font-semibold text-neutral-100">{data.organization.name}</h1>

    <h2 class="mt-8 mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
      Operations
    </h2>
    <ul class="space-y-2">
      {#each data.orgOperations as op (op.slug)}
        <li>
          <a
            class="block rounded border border-neutral-800 px-4 py-3 transition hover:border-amber-400"
            href="/{data.organization.slug}/{op.slug}"
          >
            {op.name}
          </a>
        </li>
      {:else}
        <li class="text-sm text-neutral-500">No operations in this organization yet.</li>
      {/each}
    </ul>
  </div>
</main>
