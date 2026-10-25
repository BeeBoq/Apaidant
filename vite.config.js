import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    VitePWA({
      // La mise à jour n'est jamais appliquée d'office : la page Maman
      // l'applique la nuit, l'espace aidant tout de suite (voir src/lib/miseAJour.js).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icone.svg'],
      manifest: {
        name: 'Page Maman',
        short_name: 'Maman',
        description: "L'heure, les rendez-vous du jour et un mot de la famille.",
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'fullscreen',
        orientation: 'any',
        background_color: '#FBF8F1',
        theme_color: '#FBF8F1',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
