import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-icons/icon-192.png', 'pwa-icons/icon-512.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,json,woff,woff2}']
      },
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        id: '/',
        name: 'Skedz',
        short_name: 'Skedz',
        description: 'Offline-first congress schedule viewer PWA',
        categories: ['productivity', 'utilities'],
        lang: 'en',
        dir: 'ltr',
        orientation: 'portrait-primary',
        scope: '/',
        theme_color: '#10171e',
        background_color: '#10171e',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/pwa-icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'monochrome' }
        ]
      },
      workbox: {
        // App shell precache is handled automatically by vite-plugin-pwa.
        // Runtime caching for schedule JSON endpoints (best-effort).
        runtimeCaching: [
          {
            // Cache any URL ending with schedule.json (works for CCC, frab-derived feeds, etc.)
            urlPattern: /\/schedule\.json(\?.*)?$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'schedule-json',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 } // 30 days
            }
          }
        ]
      }
    })
  ],
  build: {
    sourcemap: false
  }
})
