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
/**
 * Preloads the critical font files (Onest latin + cyrillic, display cyrillic) so text doesn't flash in the fallback font.
 * Fonts are self-hosted (src/fonts.css) — no third-party request, precached by the service worker for offline use.
 */
function preloadFonts(): Plugin {
  let base = '/'
  return {
    name: 'preload-fonts',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((f) => /(onest-(latin|cyrillic)|sofia-sans-extra-condensed-cyrillic)-wght-normal-[\w-]+\.woff2$/.test(f))
        return files.map((f) => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `${base}${f}`, crossorigin: '' },
          injectTo: 'head' as const,
        }))
      },
    },
  }
}

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
  const contentDir = fileURLToPath(new URL('./content/', import.meta.url))
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
      rolldownOptions: {
        output: {
          codeSplitting: {
            // All course content (content/**/*.json, cheat-sheets) in one named chunk. It is needed at start-up anyway
            // (the app validates it on import), but shared with lazy pages it otherwise got merged with — and named
            // after — whatever UI module those pages share (e.g. «WordList»), pulling that UI into start-up.
            groups: [{ name: 'content', test: (id: string) => id.startsWith(contentDir) }],
          },
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // 'prompt': a new version waits for «Обновить» (UpdatePrompt) instead of reloading mid-lesson.
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'icons/icon.svg', 'icons/*.png'],
        manifest: {
          name: 'Learning Portuguese',
          short_name: 'Portuguese',
          description: 'Личный тренажёр европейского португальского (pt-PT)',
          lang: 'ru',
          id: base,
          start_url: base,
          scope: base,
          display: 'standalone',
          background_color: '#E2E2DF',
          theme_color: '#E2E2DF',
          shortcuts: [
            { name: 'Повторение', short_name: 'Повторение', url: `${base}review` },
            { name: 'Курс', short_name: 'Курс', url: `${base}syllabus` },
          ],
          icons: [
            { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: `${base}icons/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: `${base}icons/icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,woff2,webp}'],
          // Hi-DPI illustration variants (hero 2560/1600, squares 1024) are left to the runtime cache below:
          // precaching them would add ~2.3 MB to every install; the 1264/800 hero and 512/256 squares cover offline use.
          globIgnores: ['404.html', 'illustrations/hero-2560.webp', 'illustrations/hero-1600.webp', 'illustrations/*-1024.webp'],
          navigateFallback: `${base}index.html`,
          navigateFallbackDenylist: [new RegExp(`^${esc}audio/`), new RegExp(`^${esc}__/`)],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: new RegExp(`${esc}illustrations/[^/?#]+\\.webp$`),
              handler: 'CacheFirst',
              options: {
                cacheName: 'illustrations',
                expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
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
      preloadFonts(),
      spaFallback404(),
    ],
  }
})
