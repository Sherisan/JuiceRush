import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: /api is proxied to the game API (FeedingFranzeeAPI on http://localhost:5003).
// Production builds call the API directly via VITE_API_BASE.
// Open the game with ?demo (or set VITE_DEMO=1) to play offline against the in-browser demo engine.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5184,
    proxy: {
      '/api': { target: 'http://localhost:5003', changeOrigin: true },
    },
  },
});
