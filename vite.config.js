import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH est défini par le workflow GitHub Pages (ex. "/hery/"). En local : "/".
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // enregistrement manuel dans src/main.js
      manifest: {
        name: 'Hery — Carnet d’entraînement',
        short_name: 'Hery',
        description: 'Carnet d’entraînement 24 semaines, 100 % hors ligne.',
        lang: 'fr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0e1116',
        theme_color: '#0e1116',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Tout est précaché, y compris program.json : l'app fonctionne en mode avion.
        globPatterns: ['**/*.{js,css,html,json,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
