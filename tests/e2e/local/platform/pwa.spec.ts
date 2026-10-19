/**
 * PWA (workstream E, Chromium only): manifest, service worker install/control, precache budget, offline
 * navigation, and the update flow of UpdatePrompt (src/components/AppStatus.tsx) across «deploys» v1…v7 made
 * from the local build (tests/helpers/e-pwa.ts) — ported from the ad-hoc puppeteer scripts.
 *
 *   A  an update found while (re)loading is applied silently with a single extra reload, no banner
 *   B  mid-session update → banner; «Позже» hides it without reloading; the next reload applies it silently
 *   C  «Обновить» switches in one click
 *   D  after «Позже», the next in-app page change applies the update
 *   E  «Обновить» while a newer version is still downloading: still one click, ends on the newest
 */
import { readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from '../../../helpers/test'
import {
  DIST,
  VersionServer,
  checkForUpdate,
  countNavigations,
  installVersion,
  interact,
  prepareVersions,
  staysSw,
  untilSw,
} from '../../../helpers/e-pwa'

const PORT = Number(process.env.E2E_PWA_PORT ?? 4325)

test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile, 'service-worker update flow: desktop Chromium')
test.use({ serviceWorkers: 'allow' })
test.describe.configure({ mode: 'serial' })

let server: VersionServer

test.beforeAll(async ({ browserName }, info) => {
  void browserName
  if (info.project.name !== 'desktop-chromium') return
  const root = prepareVersions(resolve(`.e2e/E-pwa-${info.workerIndex}`), 7)
  server = new VersionServer(root, PORT)
  await server.start()
})
test.afterAll(async () => {
  await server?.close()
})

test('manifest, icons and a precache within budget', async ({ page }) => {
  server.deploy(1)
  const res = await page.request.get(`${server.url}manifest.webmanifest`)
  expect(res.ok()).toBe(true)
  const m = (await res.json()) as { name: string; start_url: string; scope: string; display: string; icons: { src: string; sizes: string; purpose: string }[] }
  expect(m).toMatchObject({ start_url: '/learning-portuguese/', scope: '/learning-portuguese/', display: 'standalone', lang: 'ru' })
  expect(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true)
  for (const i of m.icons) expect((await page.request.get(`${server.origin}${i.src}`)).status(), i.src).toBe(200)

  // Every precached URL exists; the total stays under the 5 MB budget (docs/testing.md §4 E).
  const sw = readFileSync(join(DIST, 'sw.js'), 'utf8')
  const urls = [...sw.matchAll(/\{url:"([^"]+)",revision:/g)].map((x) => x[1])
  const total = urls.reduce((n, u) => n + statSync(join(DIST, u)).size, 0)
  test.info().annotations.push({ type: 'precache', description: `${urls.length} files, ${(total / 1e6).toFixed(2)} MB` })
  expect(urls).toContain('index.html')
  expect(urls.some((u) => u.startsWith('assets/content-'))).toBe(true)
  expect(total).toBeLessThanOrEqual(5 * 1024 * 1024)
})

test('the service worker installs, controls the page after a reload and serves visited routes offline', async ({ page, context }) => {
  await installVersion(page, server, 1)
  const routes = ['', 'syllabus', 'topic/a1-ser-estar', 'review', 'practice/situations', 'settings']
  for (const r of routes) {
    await page.goto(server.url + r)
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible()
  }
  await context.setOffline(true)
  for (const r of [...routes, 'words', 'practice/cheatsheets']) {
    await page.goto(server.url + r)
    await expect(page.getByRole('main').getByRole('heading', { level: 1 }), `offline: /${r}`).toBeVisible()
  }
  await expect(page.getByText(/^Нет сети/)).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByText(/^Нет сети/)).toHaveCount(0)
})

test('A: an update found while reloading is applied silently (one extra reload, no banner)', async ({ page }) => {
  await installVersion(page, server, 1)
  server.deploy(2)
  const navs = countNavigations(page)
  await page.reload()
  await untilSw(page, (s) => s.build === 'v2' && s.controlled && !s.waiting && !s.installing, 'v2 controls the page after the reload')
  await staysSw(page, (s) => !s.banner && s.build === 'v2', 'no banner, stays on v2')
  expect(navs(), 'the user’s reload + at most one automatic reload').toBeLessThanOrEqual(2)
  const again = countNavigations(page)
  await page.reload()
  await staysSw(page, (s) => !s.banner && s.build === 'v2', 'next reload: still v2, no banner')
  expect(again(), 'no further automatic reloads').toBe(1)
})

test('B: a mid-session update shows the banner; «Позже» hides it; the next reload applies it silently', async ({ page }) => {
  await installVersion(page, server, 2)
  await interact(page)
  server.deploy(3)
  await checkForUpdate(page)
  await untilSw(page, (s) => s.banner && s.build === 'v2' && s.waiting, 'banner once v3 is fully downloaded')
  await expect(page.getByRole('button', { name: 'Обновить' })).toBeVisible()
  const navs = countNavigations(page)
  await page.getByRole('button', { name: 'Позже' }).click()
  await staysSw(page, (s) => !s.banner && s.build === 'v2', '«Позже»: banner gone, no reload', 2000)
  expect(navs()).toBe(0)
  await page.reload()
  await untilSw(page, (s) => s.build === 'v3' && s.controlled && !s.waiting, 'reload with a waiting worker → v3')
  await staysSw(page, (s) => !s.banner && s.build === 'v3', 'no banner after the silent update')
})

test('C: «Обновить» switches to the new version in one click', async ({ page }) => {
  await installVersion(page, server, 3)
  await interact(page)
  server.deploy(4)
  await checkForUpdate(page)
  await untilSw(page, (s) => s.banner && s.build === 'v3', 'banner for v4')
  await page.getByRole('button', { name: 'Обновить' }).click()
  await untilSw(page, (s) => s.build === 'v4' && s.controlled && !s.waiting, 'one click → v4')
  await staysSw(page, (s) => !s.banner && s.build === 'v4', 'no banner on v4')
})

test('D: after «Позже», the next in-app page change applies the update', async ({ page }) => {
  await installVersion(page, server, 4)
  await interact(page)
  server.deploy(5)
  await checkForUpdate(page)
  await untilSw(page, (s) => s.banner && s.build === 'v4', 'banner for v5')
  await page.getByRole('button', { name: 'Позже' }).click()
  await untilSw(page, (s) => !s.banner, 'banner hidden')
  await page.getByRole('navigation', { name: 'Основные разделы' }).getByRole('link', { name: 'Курс' }).click()
  await untilSw(page, (s) => s.build === 'v5' && s.controlled && !s.waiting, 'v5 on the next page')
  expect(new URL(page.url()).pathname).toBe('/learning-portuguese/syllabus')
})

test('E: «Обновить» while a newer version is still downloading — one click ends on the newest', async ({ page }) => {
  test.setTimeout(60_000)
  await installVersion(page, server, 5)
  await interact(page)
  server.deploy(6)
  await checkForUpdate(page)
  await untilSw(page, (s) => s.banner && s.build === 'v5', 'banner for v6')
  server.deploy(7, 1500) // v7 lands while v6 waits; its precache downloads slowly
  await checkForUpdate(page)
  await untilSw(page, (s) => s.installing, 'v7 installing', 5000)
  let clicks = 0
  const button = page.getByRole('button', { name: 'Обновить' })
  if (await button.isEnabled()) {
    await button.click()
    clicks++
  }
  await untilSw(page, (s) => s.build === 'v7' && s.controlled && !s.waiting && !s.installing, 'ends on v7', 45_000)
  await staysSw(page, (s) => !s.banner && s.build === 'v7', 'no banner on v7', 2000)
  expect(clicks).toBe(1)
})
