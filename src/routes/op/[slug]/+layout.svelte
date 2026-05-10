<script lang="ts">
  import type { Snippet } from 'svelte';
  import TopBar from '$lib/components/shell/TopBar.svelte';
  import BottomBar from '$lib/components/shell/BottomBar.svelte';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  function changeOperation(slug: string) {
    location.assign(slug ? `/op/${slug}` : '/');
  }

  function changeLocale(locale: string) {
    fetch(`/api/i18n/${locale}/select`, { method: 'POST' }).then(() => location.reload());
  }
</script>

<TopBar
  currentOpSlug={data.operation.slug}
  operations={data.operations}
  locale={data.locale}
  locales={data.enabledLocales}
  onChangeOperation={changeOperation}
  onChangeLocale={changeLocale}
/>

<div class="flex flex-1 overflow-hidden">
  {@render children()}
</div>

<BottomBar />
