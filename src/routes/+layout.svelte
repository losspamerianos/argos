<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import TopBar from '$lib/components/shell/TopBar.svelte';
  import type { LayoutData } from './$types';

  type ScopedPageData = {
    organization?: { slug: string };
    operation?: { slug: string };
    orgOperations?: { slug: string; name: string }[];
  };

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  const pageData = $derived(page.data as ScopedPageData);
  const orgSlug = $derived(pageData.organization?.slug);
  const opSlug = $derived(pageData.operation?.slug);
  const orgOps = $derived(pageData.orgOperations ?? []);

  // Exact match (not startsWith) so a future /login/something route does not
  // silently inherit the chrome-hidden / next-from-query behaviour.
  const isLoginPage = $derived(page.url.pathname === '/login');

  // The TopBar is the global chrome; on `/login` it is meaningless (the org
  // selector points to authenticated routes the visitor cannot yet reach).
  const showChrome = $derived(!isLoginPage);

  // The login link should round-trip the visitor back to wherever they were
  // when they clicked it, modulo the standard open-redirect guard server-side.
  // When we're already on /login (e.g. after a server-side redirect), pick up
  // the existing `?next=` rather than capturing /login itself as the target.
  const loginNext = $derived(
    isLoginPage
      ? page.url.searchParams.get('next') ?? '/'
      : `${page.url.pathname}${page.url.search}`
  );

  function changeOrg(slug: string) {
    location.assign(slug ? `/${slug}` : '/');
  }

  function changeOp(slug: string) {
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
  {#if showChrome}
    <TopBar
      organizations={data.organizations}
      currentOrgSlug={orgSlug}
      operations={orgOps}
      currentOpSlug={opSlug}
      locale={data.locale}
      locales={data.enabledLocales}
      user={data.user}
      loginNext={loginNext}
      onChangeOrg={changeOrg}
      onChangeOp={changeOp}
      onChangeLocale={changeLocale}
    />
  {/if}
  {@render children()}
</div>
