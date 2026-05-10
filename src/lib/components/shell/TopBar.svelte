<script lang="ts">
  type SlugItem = { slug: string; name: string };
  type LocaleEntry = { code: string; displayName: string };
  type Props = {
    organizations: SlugItem[];
    currentOrgSlug?: string;
    operations: SlugItem[];
    currentOpSlug?: string;
    locale: string;
    locales: LocaleEntry[];
    onChangeOrg: (slug: string) => void;
    onChangeOp: (slug: string) => void;
    onChangeLocale: (locale: string) => void;
  };
  let {
    organizations,
    currentOrgSlug,
    operations,
    currentOpSlug,
    locale,
    locales,
    onChangeOrg,
    onChangeOp,
    onChangeLocale
  }: Props = $props();
</script>

<header
  class="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4 py-2 text-sm"
>
  <div class="flex items-center gap-3">
    <a href="/" class="font-mono text-xs uppercase tracking-widest text-amber-400">ARGOS</a>

    <span class="text-neutral-600">/</span>
    <select
      class="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
      value={currentOrgSlug ?? ''}
      onchange={(e) => onChangeOrg((e.currentTarget as HTMLSelectElement).value)}
    >
      <option value="">— Organization —</option>
      {#each organizations as org (org.slug)}
        <option value={org.slug}>{org.name}</option>
      {/each}
    </select>

    {#if currentOrgSlug}
      <span class="text-neutral-600">/</span>
      <select
        class="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
        value={currentOpSlug ?? ''}
        onchange={(e) => onChangeOp((e.currentTarget as HTMLSelectElement).value)}
      >
        <option value="">— Operation —</option>
        {#each operations as op (op.slug)}
          <option value={op.slug}>{op.name}</option>
        {/each}
      </select>
    {/if}
  </div>

  <div class="flex items-center gap-3 text-xs text-neutral-400">
    <select
      class="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
      value={locale}
      onchange={(e) => onChangeLocale((e.currentTarget as HTMLSelectElement).value)}
    >
      {#each locales as l (l.code)}
        <option value={l.code}>{l.displayName}</option>
      {/each}
    </select>
  </div>
</header>
