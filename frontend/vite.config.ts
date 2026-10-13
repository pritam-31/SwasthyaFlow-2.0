import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      // Frontend talks to the backend through same-origin /api (see src/services/api.ts).
      '/api': 'http://localhost:4000',
      '/health': 'http://localhost:4000',
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'आरोग्य Sathi',
        short_name: 'आरोग्य Sathi',
        description:
          'AI-powered Human-in-the-Loop Healthcare Triage & Referral Assistant. Synthetic/public sample data only.',
        theme_color: '#1f7d6b',
        background_color: '#f5f7fa',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,woff,ttf}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Offline reads (P1-8): network-first for the anonymised, offline-safe GET
        // endpoints only. Report/visual blobs and anything that can carry raw PII
        // are intentionally excluded — those are online-only.
        runtimeCaching: [
          {
            urlPattern: /\/api\/sessions(\/[^/?]+)?(\/(followups|timeline))?(\?.*)?$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'swasthyaflow-sessions',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 30, maxAgeSeconds: 300 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/sync\/version(\?.*)?$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'swasthyaflow-sync-meta',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 5, maxAgeSeconds: 300 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})