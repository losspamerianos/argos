<script lang="ts">
  import type { Snippet } from 'svelte';
  import TopBar from '$lib/components/shell/TopBar.svelte';
  import BottomBar from '$lib/components/shell/BottomBar.svelte';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  function changeOrg(slug: string) {
    location.assign(slug ? `/${slug}` : '/');
  }

  function changeOp(slug: string) {
    location.assign(slug ? `/${data.organization.slug}/${slug}` : `/${data.organization.slug}`);
  }

  function changeLocale(locale: string) {
    fetch(`/api/i18n/${locale}/select`, { method: 'POST' }).then(() => location.reload());
  }
</script>

<TopBar
  organizations={data.organizations}
  currentOrgSlug={data.organization.slug}
  operations={data.orgOperations}
  currentOpSlug={data.operation.slug}
  locale={data.locale}
  locales={data.enabledLocales}
  user={data.user}
  onChangeOrg={changeOrg}
  onChangeOp={changeOp}
  onChangeLocale={changeLocale}
/>

<div class="flex flex-1 overflow-hidden">
  {@render children()}
</div>

<BottomBar />
