/**
 * Workstream E: PWA test harness. Turns one local build (E2E_OUT_DIR) into several «deploys» v1…vN without
 * rebuilding — each version gets its own index.html (tagged `window.__BUILD_TAG = 'vN'`) and a sw.js whose
 * precache revision of index.html differs, so the browser sees a new service worker — and serves the current
 * version from a tiny static server (SPA fallback, `no-cache`, optional delay for sub-resources to simulate a
 * slow download of the new precache).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { extname, join, resolve } from 'node:path'
import { expect, type Page } from '@playwright/test'

export const BASE = '/learning-portuguese/'
export const DIST = resolve(process.env.E2E_OUT_DIR ?? '.e2e/local-dist')

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
}

/** Creates `<root>/v1…vN` from DIST (big folders are symlinked). Returns the root. */
export function prepareVersions(root: string, n: number): string {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  const html = readFileSync(join(DIST, 'index.html'), 'utf8')
  const sw = readFileSync(join(DIST, 'sw.js'), 'utf8')
  const rev = /(\{url:"index\.html",revision:")([0-9a-f]+)(")/
  if (!rev.test(sw)) throw new Error('sw.js: index.html precache entry not found')
  for (let v = 1; v <= n; v++) {
    const dir = join(root, `v${v}`)
    mkdirSync(dir)
    for (const name of readdirSync(DIST)) {
      const src = join(DIST, name)
      if (name === 'index.html' || name === 'sw.js') continue
      if (statSync(src).isDirectory()) symlinkSync(src, join(dir, name), 'dir')
      else cpSync(src, join(dir, name))
    }
    writeFileSync(join(dir, 'index.html'), html.replace('<head>', `<head><script>window.__BUILD_TAG='v${v}'</script>`))
    writeFileSync(join(dir, 'sw.js'), sw.replace(rev, (_m, a: string, h: string, c: string) => `${a}${h.slice(0, -4)}${String(v).padStart(4, '0')}${c}`))
  }
  return root
}

export class VersionServer {
  private dir = ''
  private delay = 0
  private server: http.Server | null = null
  requests = 0
  private readonly root: string
  readonly port: number
  constructor(root: string, port: number) {
    this.root = root
    this.port = port
  }

  get origin() {
    return `http://localhost:${this.port}`
  }
  get url() {
    return `${this.origin}${BASE}`
  }

  /** Switches the served version; `delayMs` slows every sub-resource except sw.js / workbox (slow precache download). */
  deploy(v: number, delayMs = 0) {
    this.dir = join(this.root, `v${v}`)
    this.delay = delayMs
  }

  async start() {
    this.server = http.createServer((req, res) => {
      this.requests++
      const u = new URL(req.url ?? '/', 'http://x')
      let p = decodeURIComponent(u.pathname)
      if (!p.startsWith(BASE)) return res.writeHead(404).end()
      p = p.slice(BASE.length) || 'index.html'
      let f = join(this.dir, p)
      if (!f.startsWith(this.dir) || !existsSync(f) || statSync(f).isDirectory()) f = join(this.dir, 'index.html')
      const slow = this.delay && req.headers['sec-fetch-mode'] !== 'navigate' && !p.endsWith('sw.js') && !p.startsWith('workbox-')
      const send = () => {
        res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-cache' })
        res.end(readFileSync(f))
      }
      if (slow) setTimeout(send, this.delay)
      else send()
    })
    await new Promise<void>((ok, fail) => {
      this.server!.once('error', fail)
      this.server!.listen(this.port, ok)
    })
  }

  async close() {
    this.server?.closeAllConnections()
    await new Promise<void>((ok) => (this.server ? this.server.close(() => ok()) : ok()))
  }
}

export interface SwState {
  build: string | undefined
  controlled: boolean
  waiting: boolean
  installing: boolean
  banner: boolean
  button: string | null
}

export async function swState(page: Page): Promise<SwState | null> {
  try {
    return await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration()
      const btn = [...document.querySelectorAll('button')].find((b) => /Обнов/.test(b.textContent ?? ''))
      return {
        build: (window as { __BUILD_TAG?: string }).__BUILD_TAG,
        controlled: Boolean(navigator.serviceWorker.controller),
        waiting: Boolean(r?.waiting),
        installing: Boolean(r?.installing),
        banner: [...document.querySelectorAll('[role=status]')].some((e) => /Доступна новая версия|Обновляем/.test(e.textContent ?? '')),
        button: btn ? `${btn.textContent}${(btn as HTMLButtonElement).disabled ? ' (disabled)' : ''}` : null,
      }
    })
  } catch {
    return null // navigation in progress
  }
}

/** Polls the service-worker state until `pred` holds. */
export async function untilSw(page: Page, pred: (s: SwState) => boolean, message: string, timeout = 20_000): Promise<SwState> {
  let last: SwState | null = null
  await expect
    .poll(
      async () => {
        last = await swState(page)
        return !!last && pred(last)
      },
      { message, timeout, intervals: [200] },
    )
    .toBe(true)
  return last!
}

/** Asserts `pred` keeps holding for `ms` (no late banner, no extra reload). */
export async function staysSw(page: Page, pred: (s: SwState) => boolean, message: string, ms = 3000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const s = await swState(page)
    if (s) expect(pred(s), `${message}: ${JSON.stringify(s)}`).toBe(true)
    await page.waitForTimeout(250)
  }
}

/** Counts main-frame navigations (reloads) from now on. */
export function countNavigations(page: Page): () => number {
  let n = 0
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) n++
  })
  return () => n
}

/** First visit installs the SW; a reload puts the page under its control. */
export async function installVersion(page: Page, server: VersionServer, v: number) {
  server.deploy(v)
  await page.goto(server.url)
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await page.reload()
  await untilSw(page, (s) => s.controlled && s.build === `v${v}` && !s.waiting && !s.installing, `v${v} installed and controlling`)
}

/** The user has started using the page (UpdatePrompt treats later updates as mid-session). */
export async function interact(page: Page) {
  await page.mouse.click(2, 2)
  await page.evaluate(() => sessionStorage.removeItem('pwa-update-reload-at'))
}

export const checkForUpdate = (page: Page) =>
  page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update()
  })
