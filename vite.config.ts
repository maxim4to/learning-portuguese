import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * GitHub Pages has no SPA rewrites: it serves 404.html for unknown paths, so a copy of index.html
 * there makes deep links (e.g. /learning-portuguese/topic/x) boot the app with the right URL.
 */
function spaFallback404(): Plugin {
  let outDir = 'dist'
  return {
    name: 'spa-fallback-404',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = config.build.outDir
    },
    writeBundle() {
      copyFileSync(join(outDir, 'index.html'), join(outDir, '404.html'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Site is served as a GitHub Pages project site: https://mi-crafts.com/learning-portuguese/
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const rawBase = env.VITE_BASE_PATH || '/learning-portuguese/'
  const base = `/${rawBase.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/')
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  return {
    base,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      // Firebase SDK chunk (lazy, only when configured) is ~540 kB.
      chunkSizeWarningLimit: 700,
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icons/icon.svg', 'icons/*.png'],
        manifest: {
          name: 'Português PT',
          short_name: 'Português',
          description: 'Личный тренажёр европейского португальского (pt-PT)',
          lang: 'ru',
          id: base,
          start_url: base,
          scope: base,
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#047857',
          icons: [
            { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: `${base}icons/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: `${base}icons/icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,woff2}'],
          globIgnores: ['404.html'],
          navigateFallback: `${base}index.html`,
          navigateFallbackDenylist: [new RegExp(`^${esc}audio/`), new RegExp(`^${esc}__/`)],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          runtimeCaching: [
            {
              // A RegExp, not a function: functions are serialized into sw.js without their closure (`base`).
              urlPattern: new RegExp(`${esc}audio/[^/?#]+\\.mp3$`),
              handler: 'CacheFirst',
              options: {
                cacheName: 'audio-mp3',
                expiration: { maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
                rangeRequests: true,
              },
            },
          ],
        },
      }),
      spaFallback404(),
    ],
  }
})
