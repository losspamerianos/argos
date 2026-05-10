<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import TopBar from '$lib/components/shell/TopBar.svelte';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  function changeOrg(slug: string) {
    location.assign(slug ? `/${slug}` : '/');
  }

  function changeOp(slug: string) {
    const orgSlug = (page.data as { organization?: { slug: string } }).organization?.slug;
    if (!slug) {
      location.assign(orgSlug ? `/${orgSlug}` : '/');
    } else if (orgSlug) {
      location.assign(`/${orgSlug}/${slug}`);
    }
  }

  async function changeLocale(locale: string) {
    const res = await fetch(`/api/i18n/${locale}/select`, { method: 'POST' });
    if (res.ok) await invalidateAll();
  }
</script>

<div class="flex h-screen flex-col">
  <TopBar
    organizations={data.organizations}
    currentOrgSlug={(page.data as { organization?: { slug: string } }).organization?.slug}
    operations={(page.data as { orgOperations?: { slug: string; name: string }[] }).orgOperations ??
      []}
    currentOpSlug={(page.data as { operation?: { slug: string } }).operation?.slug}
    locale={data.locale}
    locales={data.enabledLocales}
    user={data.user}
    onChangeOrg={changeOrg}
    onChangeOp={changeOp}
    onChangeLocale={changeLocale}
  />
  {@render children()}
</div>
