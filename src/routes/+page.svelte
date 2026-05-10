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

    {#if !data.user}
      <p class="mt-8 text-sm text-neutral-400">
        Sign in to access organizations and operations.
      </p>
      <a
        href="/login"
        class="mt-3 inline-block rounded border border-neutral-700 px-4 py-2 text-sm transition hover:border-amber-400 hover:text-amber-400"
      >
        Sign in
      </a>
    {:else}
      <h2 class="mt-8 mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        Organizations
      </h2>
      <ul class="space-y-2">
        {#each data.organizations as org (org.slug)}
          <li>
            <a
              class="block rounded border border-neutral-800 px-4 py-3 transition hover:border-amber-400"
              href="/{org.slug}"
            >
              {org.name}
            </a>
          </li>
        {:else}
          <li class="text-sm text-neutral-500">No organizations available for your account.</li>
        {/each}
      </ul>
    {/if}
  </div>
</main>
