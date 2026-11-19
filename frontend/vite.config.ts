import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev the React app (5173) proxies API + demo assets to the backend (4000), so no CORS setup is needed.
const target = process.env.VITE_PROXY_TARGET ?? 'http://localhost:4000';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': target, '/demo': target } },
});
