<script lang="ts">
  type SlugItem = { slug: string; name: string };
  type LocaleEntry = { code: string; displayName: string };
  type UserInfo = { id: string; email: string; displayName: string | null } | null;

  type Props = {
    organizations: SlugItem[];
    currentOrgSlug?: string;
    operations: SlugItem[];
    currentOpSlug?: string;
    locale: string;
    locales: LocaleEntry[];
    user?: UserInfo;
    /** Pre-encoded `next` path for the Login link, including any query string. */
    loginNext?: string;
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
    user = null,
    loginNext = '/',
    onChangeOrg,
    onChangeOp,
    onChangeLocale
  }: Props = $props();

  const loginHref = $derived(
    loginNext && loginNext !== '/'
      ? `/login?next=${encodeURIComponent(loginNext)}`
      : '/login'
  );

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Network error: cookies still cleared on the server best-effort; surface
      // by routing to /login regardless so the user is not stuck in an
      // ambiguous state.
    } finally {
      location.assign('/login');
    }
  }
</script>

<header
  class="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4 py-2 text-sm"
>
  <div class="flex items-center gap-3">
    <a href="/" class="font-mono text-xs uppercase tracking-widest text-amber-400">ARGOS</a>

    <span class="text-neutral-600" aria-hidden="true">/</span>
    <select
      class="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
      value={currentOrgSlug ?? ''}
      aria-label="Organization"
      onchange={(e) => onChangeOrg((e.currentTarget as HTMLSelectElement).value)}
    >
      <option value="">— Organization —</option>
      {#each organizations as org (org.slug)}
        <option value={org.slug}>{org.name}</option>
      {/each}
    </select>

    {#if currentOrgSlug}
      <span class="text-neutral-600" aria-hidden="true">/</span>
      <select
        class="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
        value={currentOpSlug ?? ''}
        aria-label="Operation"
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
      aria-label="Language"
      onchange={(e) => onChangeLocale((e.currentTarget as HTMLSelectElement).value)}
    >
      {#each locales as l (l.code)}
        <option value={l.code}>{l.displayName}</option>
      {/each}
    </select>

    {#if user}
      <span class="text-neutral-300">{user.displayName ?? user.email}</span>
      <button
        type="button"
        onclick={logout}
        class="rounded border border-neutral-700 px-2 py-1 hover:border-neutral-500"
      >
        Logout
      </button>
    {:else}
      <a
        href={loginHref}
        class="rounded border border-neutral-700 px-2 py-1 hover:border-amber-400 hover:text-amber-400"
      >
        Login
      </a>
    {/if}
  </div>
</header>
