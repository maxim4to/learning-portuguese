/**
 * Performance budgets (workstream E).
 *   - chunk sizes of the local build (E2E_OUT_DIR): fail above the recorded baseline + 10 % (raw and gzip);
 *   - the JS/CSS a cold start of «/» actually downloads (local mode), same rule;
 *   - cold-load timings under 4× CPU throttling (Chromium/CDP): reported as annotations, soft-asserted.
 * Baselines measured on 2026-10-19 (HEAD dabcc13). When a change legitimately grows a chunk, update BASELINE.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { DIST } from '../../../helpers/e-pwa'
import { expect, test } from '../../../helpers/test'

const ALLOWANCE = 1.1
/** chunk name (file name without the hash) → [raw bytes, gzip bytes]. */
const BASELINE: Record<string, [number, number]> = {
  'index.js': [223_623, 69_578], // entry
  'index.css': [92_131, 16_725],
  'App.js': [546_890, 162_572],
  'content.js': [1_544_123, 403_618], // all course content (needed at start-up)
  'Dialog.js': [216_152, 69_159],
  'lexicon.js': [540_873, 145_300], // lazy: word lookup
  'WordsPage.js': [37_145, 12_313], // lazy: «Мой словарь»
  'WordPage.js': [13_301, 4_514], // lazy: word page
  'LookupCard.js': [14_436, 5_092],
  'firestoreBackend.js': [540_416, 159_584], // lazy, Firebase mode only
  'auth.js': [69_545, 20_705], // lazy, Firebase mode only
}
/** Everything «/» downloads on a cold start in local mode (JS + CSS), gzip bytes. */
const STARTUP_GZIP_BASELINE = 729_375 // 11 files: index, App, content, Dialog, store, firebase (config stub), … + 2 CSS

const gz = (b: Buffer) => gzipSync(b, { level: 9 }).length

function chunks() {
  const dir = join(DIST, 'assets')
  const out = new Map<string, { file: string; raw: number; gzip: number }>()
  for (const file of readdirSync(dir)) {
    const m = /^(.+?)-[\w-]{8}\.(js|css)$/.exec(file)
    if (!m) continue
    const name = `${m[1]}.${m[2]}`
    const b = readFileSync(join(dir, file))
    const prev = out.get(name)
    // Same name twice (e.g. two `index.esm` chunks): keep the larger one.
    if (!prev || prev.raw < b.length) out.set(name, { file, raw: b.length, gzip: gz(b) })
  }
  return out
}

test.describe('bundle budgets', () => {
  test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile, 'build artefacts: once (desktop-chromium)')

  test('every tracked chunk stays within its baseline + 10 %', async ({ browserName }, info) => {
    void browserName
    const all = chunks()
    const over: string[] = []
    for (const [name, [raw, gzip]] of Object.entries(BASELINE)) {
      const c = all.get(name)
      expect(c, `chunk ${name} not found — renamed/merged? update BASELINE in budgets.spec.ts`).toBeTruthy()
      info.annotations.push({ type: `chunk ${name}`, description: `${c!.raw} B raw (${((c!.raw / raw - 1) * 100).toFixed(1)} %), ${c!.gzip} B gzip` })
      if (c!.raw > raw * ALLOWANCE) over.push(`${name}: raw ${c!.raw} > ${Math.round(raw * ALLOWANCE)}`)
      if (c!.gzip > gzip * ALLOWANCE) over.push(`${name}: gzip ${c!.gzip} > ${Math.round(gzip * ALLOWANCE)}`)
    }
    expect(over).toEqual([])
  })

  test('no untracked chunk above 100 kB gzip (a new heavy dependency would show up here)', async () => {
    const heavy = [...chunks()].filter(([name, c]) => !(name in BASELINE) && c.gzip > 100_000).map(([n, c]) => `${n} ${c.gzip} B gzip`)
    expect(heavy).toEqual([])
  })

  test('a cold start of «/» downloads JS + CSS within budget, without the lazy chunks', async ({ page }, info) => {
    const loaded: string[] = []
    page.on('response', (r) => {
      const u = new URL(r.url())
      if (/\/assets\/[^/]+\.(js|css)$/.test(u.pathname)) loaded.push(u.pathname.split('/').pop()!)
    })
    await page.goto('')
    await expect(page.locator('main h1')).toBeVisible()
    await page.waitForLoadState('networkidle')
    const all = chunks()
    const byFile = new Map([...all.values()].map((c) => [c.file, c]))
    const total = loaded.reduce((n, f) => n + (byFile.get(f)?.gzip ?? 0), 0)
    info.annotations.push({ type: 'startup', description: `${loaded.length} files, ${total} B gzip: ${loaded.sort().join(', ')}` })
    console.info(`[budget] startup: ${loaded.length} files, ${total} B gzip — ${loaded.join(', ')}`)
    for (const lazy of ['firestoreBackend.js', 'auth.js', 'WordsPage.js', 'WordPage.js']) {
      expect(loaded, `${lazy} must not load on «/» in local mode`).not.toContain(all.get(lazy)?.file)
    }
    expect(total).toBeLessThanOrEqual(STARTUP_GZIP_BASELINE * ALLOWANCE)
  })
})

test.describe('cold-load timing (CPU ×4)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP CPU throttling: Chromium projects')

  test('home: first content and time-to-interactive under CPU throttling', async ({ page }, info) => {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.addInitScript(() => {
      const w = window as unknown as { __perf: { longTasks: [number, number][]; lcp: number } }
      w.__perf = { longTasks: [], lcp: 0 }
      new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__perf.longTasks.push([e.startTime, e.startTime + e.duration]))).observe({ type: 'longtask', buffered: true })
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__perf.lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true })
    })
    await page.goto('')
    await expect(page.locator('main h1')).toBeVisible({ timeout: 20_000 })
    const h1At = await page.evaluate(() => performance.now())
    // TTI ≈ end of the last long task before a 2 s quiet window (Lighthouse uses 5 s; the app has no late work).
    await page.waitForTimeout(2500)
    const m = await page.evaluate(() => {
      const w = window as unknown as { __perf: { longTasks: [number, number][]; lcp: number } }
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0
      const lastLong = w.__perf.longTasks.reduce((x, [, end]) => Math.max(x, end), 0)
      const tbt = w.__perf.longTasks.reduce((x, [s, e]) => x + Math.max(0, e - s - 50), 0)
      return { fcp, lcp: w.__perf.lcp, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, lastLong, tbt, longTasks: w.__perf.longTasks.length }
    })
    const tti = Math.max(m.dcl, m.lastLong, h1At)
    const r = (x: number) => Math.round(x)
    const summary = { fcp: r(m.fcp), lcp: r(m.lcp), h1: r(h1At), dcl: r(m.dcl), tti: r(tti), tbt: r(m.tbt), longTasks: m.longTasks }
    info.annotations.push({ type: 'timing (ms, CPU×4)', description: JSON.stringify(summary) })
    console.info(`[perf] ${info.project.name}: ${JSON.stringify(summary)}`)
    expect.soft(tti, 'TTI under 4× CPU throttling').toBeLessThan(5000)
    expect.soft(m.lcp, 'LCP under 4× CPU throttling').toBeLessThan(4000)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  })
})
