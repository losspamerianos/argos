<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let email = $state('');
  let password = $state('');
  let errorMsg: string | null = $state(null);
  let loading = $state(false);
  let emailEl: HTMLInputElement | null = $state(null);
  let passwordEl: HTMLInputElement | null = $state(null);

  // Programmatic focus instead of the HTML `autofocus` attribute, which
  // disorients screen-reader users on page load.
  $effect(() => {
    emailEl?.focus();
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    loading = true;
    errorMsg = null;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (res.ok) {
        // The server already validated `data.next` against the open-redirect
        // guard during load(); trust it.
        location.assign(data.next);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      errorMsg = body.message ?? `login_failed_${res.status}`;
      // Clear and refocus the password on failure: never leave a stale
      // password sitting in the form on a shared workstation.
      password = '';
      passwordEl?.focus();
    } catch {
      errorMsg = 'network_error';
      password = '';
      passwordEl?.focus();
    } finally {
      loading = false;
    }
  }
</script>

<main class="flex flex-1 items-center justify-center p-8">
  <form class="w-full max-w-sm space-y-4" onsubmit={submit}>
    <h1 class="font-mono text-2xl uppercase tracking-widest text-amber-400">ARGOS</h1>
    <p class="text-xs text-neutral-500">Animal Registry &amp; Geographical Operations System</p>

    <h2 class="pt-4 text-sm text-neutral-300">Sign in</h2>

    <label class="block">
      <span class="text-xs text-neutral-400">Email</span>
      <input
        type="email"
        bind:value={email}
        bind:this={emailEl}
        required
        autocomplete="username"
        class="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-400 focus:outline-none"
      />
    </label>

    <label class="block">
      <span class="text-xs text-neutral-400">Password</span>
      <input
        type="password"
        bind:value={password}
        bind:this={passwordEl}
        required
        autocomplete="current-password"
        aria-invalid={errorMsg !== null}
        class="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-400 focus:outline-none"
      />
    </label>

    {#if errorMsg}
      <p class="text-xs text-red-400" role="alert">{errorMsg}</p>
    {/if}

    <button
      type="submit"
      disabled={loading}
      class="w-full rounded border border-amber-400 bg-amber-400/10 px-4 py-2 text-sm uppercase tracking-wider text-amber-400 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? 'Signing in…' : 'Sign in'}
    </button>
  </form>
</main>
