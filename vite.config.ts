import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const usePolling = process.env.VITE_USE_POLLING === '1';

// Vite v5 rejects requests whose Host header isn't in `server.allowedHosts`.
// Comma-separated env var so reverse-proxy hostnames can be added without a
// code change (e.g. `VITE_ALLOWED_HOSTS=argos.164-68-111-61.sslip.io`).
const allowedHosts = (process.env.VITE_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: allowedHosts.length > 0 ? allowedHosts : undefined,
    watch: usePolling ? { usePolling: true, interval: 300 } : undefined
  }
});
