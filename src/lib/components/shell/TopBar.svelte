<script lang="ts">
  type Operation = { slug: string; name: string };
  type LocaleEntry = { code: string; displayName: string };
  type Props = {
    currentOpSlug?: string;
    operations: Operation[];
    locale: string;
    locales: LocaleEntry[];
    onChangeOperation: (slug: string) => void;
    onChangeLocale: (locale: string) => void;
  };
  let {
    currentOpSlug,
    operations,
    locale,
    locales,
    onChangeOperation,
    onChangeLocale
  }: Props = $props();
</script>

<header
  class="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4 py-2 text-sm"
>
  <div class="flex items-center gap-4">
    <span class="font-mono text-xs uppercase tracking-widest text-amber-400">ARGOS</span>
    <select
      class="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
      value={currentOpSlug ?? ''}
      onchange={(e) => onChangeOperation((e.currentTarget as HTMLSelectElement).value)}
    >
      <option value="">— Operation —</option>
      {#each operations as op (op.slug)}
        <option value={op.slug}>{op.name}</option>
      {/each}
    </select>
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
