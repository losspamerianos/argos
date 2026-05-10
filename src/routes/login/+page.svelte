<script lang="ts">
  let email = $state('');
  let password = $state('');
  let errorMsg: string | null = $state(null);
  let loading = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    loading = true;
    errorMsg = null;
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      const next = new URLSearchParams(location.search).get('next') ?? '/';
      location.assign(next);
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    errorMsg = data.message ?? `login_failed_${res.status}`;
    loading = false;
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
        required
        autocomplete="current-password"
        class="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-amber-400 focus:outline-none"
      />
    </label>

    {#if errorMsg}
      <p class="text-xs text-red-400">{errorMsg}</p>
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
