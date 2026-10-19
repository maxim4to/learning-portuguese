/**
 * Workstream E helpers for the emulator specs (tests/e2e/emulator). Extends tests/helpers/emulator.ts (frozen).
 *
 *   seedServer(uid, seed)     writes a Seed (tests/fixtures/seed.ts) into Firestore as the app lays it out
 *   serverIds(uid)            every document id per collection (decoded the way the app decodes them)
 *   holdFirestore(page)       parks the Listen/Write channels until release() — «the server hasn't answered yet»
 *   FirestoreTraffic          counts what the Listen stream delivered (≈ billed document reads) via CDP
 *   watchFlash(page)          records whether a loading skeleton / the sign-in screen was ever rendered
 *   snapshotKeys(page)        the per-uid device snapshot keys in localStorage
 */
import { expect, type Browser, type BrowserContext, type CDPSession, type Page, type Route } from '@playwright/test'
import type { Seed } from '../fixtures/seed'
import { COLLECTIONS, fsList, fsSet, signIn } from './emulator'

/** Firestore doc ids of cards/words are encodeURIComponent'ed by the app (firestoreBackend.ts encodeId). */
const docId = (id: string) => encodeURIComponent(id)

export async function seedServer(uid: string, seed: Seed): Promise<void> {
  const jobs: Promise<void>[] = []
  for (const p of seed.progress ?? []) jobs.push(fsSet(uid, 'progress', docId(p.topicId), p))
  for (const c of seed.cards ?? []) jobs.push(fsSet(uid, 'cards', docId(c.id), c))
  for (const e of seed.errors ?? []) jobs.push(fsSet(uid, 'errors', docId(e.id), e))
  for (const w of seed.words ?? []) jobs.push(fsSet(uid, 'words', docId(w.id), w))
  if (seed.settings) jobs.push(fsSet(uid, 'meta', 'settings', seed.settings))
  await Promise.all(jobs)
}

const decode = (id: string) => {
  try {
    return decodeURIComponent(id)
  } catch {
    return id
  }
}

/** Document ids per collection on the server (app-level ids: cards/words decoded once more). */
export async function serverIds(uid: string): Promise<Record<(typeof COLLECTIONS)[number], string[]>> {
  const out = {} as Record<(typeof COLLECTIONS)[number], string[]>
  for (const col of COLLECTIONS) out[col] = (await fsList(uid, col)).map((d) => decode(d.__id)).sort()
  return out
}

export async function serverDoc<T = Record<string, unknown>>(uid: string, col: (typeof COLLECTIONS)[number], id: string): Promise<(T & { __id: string }) | undefined> {
  return (await fsList<T>(uid, col)).find((d) => decode(d.__id) === id)
}

// ─── Network control ─────────────────────────────────────────────────────────

const LISTEN = /google\.firestore\.v1\.Firestore\/Listen\/channel/
const WRITE = /google\.firestore\.v1\.Firestore\/Write\/channel/

/**
 * Parks Firestore channel requests (default: Listen + Write) until `release()`: the app sees a server that has
 * not answered yet. Requests made after release go straight through.
 */
export async function holdFirestore(target: Page | BrowserContext, which: ('listen' | 'write')[] = ['listen', 'write']) {
  const parked: Route[] = []
  let released = false
  const res = which.map((w) => (w === 'listen' ? LISTEN : WRITE))
  const handler = (route: Route) => {
    if (released) return route.fallback()
    parked.push(route)
  }
  for (const re of res) await target.route(re, handler)
  return {
    get parked() {
      return parked.length
    },
    async release() {
      released = true
      // Continue directly (they are local requests): a parked request the page has meanwhile cancelled counts as
      // handled, and falling back into another handler would make *that* handler throw.
      for (const r of parked.splice(0)) await r.continue().catch(() => {})
      for (const re of res) await target.unroute(re, handler)
    },
  }
}

/**
 * The Firestore SDK's WebChannel probes connectivity with https://www.google.com/images/cleardot.gif when the
 * network drops. Answer it locally (it must never leave the machine, and the shared network guard would fail the test).
 */
export async function answerConnectivityProbe(target: Page | BrowserContext) {
  await target.route(/^https:\/\/www\.google\.com\/images\/cleardot\.gif/, (r) => r.fulfill({ status: 204, body: '' }))
}

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * A second «device» (fresh browser context) with the same network guard as the shared fixture: non-local
 * requests are aborted and collected (assert `blocked` is empty), the WebChannel probe is answered locally.
 */
export async function newDevice(browser: Browser) {
  const ctx = await browser.newContext()
  const blocked: string[] = []
  await ctx.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.protocol === 'data:' || url.protocol === 'blob:' || LOCAL.has(url.hostname)) return route.continue().catch(() => {})
    blocked.push(url.href)
    return route.abort('blockedbyclient').catch(() => {})
  })
  await answerConnectivityProbe(ctx)
  const page = await ctx.newPage()
  return {
    ctx,
    page,
    blocked,
    async close() {
      await ctx.close()
      expect(blocked, 'second device: requests to non-local hosts').toEqual([])
    },
  }
}

// ─── Read accounting ─────────────────────────────────────────────────────────

/**
 * Collects the Listen stream (WebChannel, length-prefixed JSON frames) through CDP and counts what the server
 * delivered. Billing model (Firestore): each document returned by a listener is one read; a query that returns
 * nothing still costs one read; a single-document listener on a missing document costs one read.
 */
export class FirestoreTraffic {
  private text = ''
  private readonly ids = new Set<string>()
  private cdp: CDPSession | null = null
  /** Listen targets the client asked to resume from a cached resume token (forward-channel request bodies). */
  resumeRequests = 0
  /** Document writes the client sent (Write channel `update` / `delete` entries). */
  writesSent = 0

  static async attach(page: Page): Promise<FirestoreTraffic> {
    const t = new FirestoreTraffic()
    const cdp = await page.context().newCDPSession(page)
    t.cdp = cdp
    await cdp.send('Network.enable')
    cdp.on('Network.responseReceived', (e) => {
      if (!LISTEN.test(e.response.url) || e.type === 'Preflight') return
      t.ids.add(e.requestId)
      cdp
        .send('Network.streamResourceContent', { requestId: e.requestId })
        .then((r) => {
          if (r.bufferedData) t.text += Buffer.from(r.bufferedData, 'base64').toString()
        })
        .catch(() => {})
    })
    cdp.on('Network.requestWillBeSent', (e) => {
      if (WRITE.test(e.request.url) && e.request.method === 'POST') t.writesSent += (decodeURIComponent(e.request.postData ?? '').match(/"(update|delete)"\s*:/g) ?? []).length
      if (LISTEN.test(e.request.url) && e.request.method === 'POST') t.resumeRequests += (decodeURIComponent(e.request.postData ?? '').match(/"resumeToken"/g) ?? []).length
    })
    cdp.on('Network.dataReceived', (e) => {
      if (t.ids.has(e.requestId) && e.data) t.text += Buffer.from(e.data, 'base64').toString()
    })
    return t
  }

  /** Every Listen response message (documentChange / documentDelete / targetChange …). */
  messages(): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = []
    // Frames: `<len>\n[[seq,[msg…]],…]`. Scan for top-level arrays instead of trusting the length prefixes
    // (chunks of one frame can arrive from different requests).
    const re = /\d+\n(\[\[[\s\S]*?\]\]\])(?=\d+\n\[\[|$)/g
    for (const m of this.text.matchAll(re)) {
      try {
        const frames = JSON.parse(m[1]) as [number, unknown[]][]
        for (const [, msgs] of frames) for (const msg of msgs) if (msg && typeof msg === 'object') out.push(msg as Record<string, unknown>)
      } catch {
        // partial frame — ignore
      }
    }
    return out
  }

  /** Delivered documents per collection (diagnostics). */
  docsByCollection(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const m of this.messages()) {
      const name = (m.documentChange as { document?: { name?: string } } | undefined)?.document?.name
      if (!name) continue
      const col = name.split('/').slice(-2, -1)[0]
      out[col] = (out[col] ?? 0) + 1
    }
    return out
  }

  /**
   * Counters. `docs` = documents the emulator delivered (it re-sends a listener's whole result set on every change
   * and ignores resume tokens, so this over-counts). `billed` ≈ production cost: distinct document versions
   * (name + updateTime) not delivered before, plus missing-document results and empty-query minimums.
   */
  reads() {
    let docs = 0
    let fresh = 0
    let deletes = 0
    let targetsAdded = 0
    let emptyTargets = 0
    const seenVersions = new Set<string>()
    const docsPerTarget = new Map<number, number>()
    for (const m of this.messages()) {
      const dc = m.documentChange as { document?: { name?: string; updateTime?: string }; targetIds?: number[] } | undefined
      if (dc) {
        docs++
        const v = `${dc.document?.name}@${dc.document?.updateTime}`
        if (!seenVersions.has(v)) {
          seenVersions.add(v)
          fresh++
        }
        for (const t of dc.targetIds ?? []) docsPerTarget.set(t, (docsPerTarget.get(t) ?? 0) + 1)
      }
      const dd = m.documentDelete as { removedTargetIds?: number[] } | undefined
      if (dd) {
        deletes++
        for (const t of dd.removedTargetIds ?? []) docsPerTarget.set(t, (docsPerTarget.get(t) ?? 0) + 1)
      }
      const tc = m.targetChange as { targetChangeType?: string; targetIds?: number[] } | undefined
      if (tc?.targetChangeType === 'ADD') targetsAdded += tc.targetIds?.length ?? 0
      if (tc?.targetChangeType === 'CURRENT') for (const t of tc.targetIds ?? []) if (!docsPerTarget.get(t)) emptyTargets++
    }
    return { docs, fresh, deletes, emptyTargets, targetsAdded, billed: fresh + deletes + emptyTargets }
  }

  /** Counters since `before` (a previous reads()). */
  since(before: ReturnType<FirestoreTraffic['reads']>) {
    const now = this.reads()
    return Object.fromEntries(Object.entries(now).map(([k, v]) => [k, v - before[k as keyof typeof before]])) as typeof now
  }

  async detach() {
    await this.cdp?.detach().catch(() => {})
  }
}

// ─── First-paint observation ─────────────────────────────────────────────────

export interface FlashLog {
  /** A page skeleton («Загрузка» status) was rendered at some point. */
  skeleton: boolean
  /** The sign-in screen was rendered at some point. */
  signIn: boolean
  /** ms since navigation start when `text` first appeared in the DOM, or null. */
  textAt: number | null
  /** Texts from `never` that were rendered at some point (e.g. an empty state before the data). */
  seen: string[]
}

/**
 * Install before page.goto/reload: records skeleton / sign-in screen appearances, when `text` first showed up
 * and whether any of `never` (texts of the empty state) was ever rendered — the «empty → filled» flash.
 */
export async function watchFlash(page: Page, text: string, never: string[] = []) {
  await page.addInitScript(
    ({ needle, never }: { needle: string; never: string[] }) => {
      const log = { skeleton: false, signIn: false, textAt: null as number | null, seen: [] as string[] }
      ;(window as unknown as { __flash: typeof log }).__flash = log
      const check = () => {
        if (document.querySelector('[role="status"][aria-label="Загрузка"]')) log.skeleton = true
        if ([...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Войти через Google'))) log.signIn = true
        const body = document.body?.textContent ?? ''
        if (log.textAt === null && body.includes(needle)) log.textAt = performance.now()
        for (const t of never) if (!log.seen.includes(t) && body.includes(t)) log.seen.push(t)
      }
      new MutationObserver(check).observe(document, { childList: true, subtree: true, characterData: true })
    },
    { needle: text, never },
  )
}

export const readFlash = (page: Page) => page.evaluate(() => (window as unknown as { __flash: FlashLog }).__flash)

// ─── Storage ─────────────────────────────────────────────────────────────────

export const snapshotKeys = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ptpt:v1:snap:')).sort())

/** The store saves the snapshot 300 ms after a change; wait until it contains `pred`. */
export async function expectSnapshot(page: Page, uid: string, pred: (docs: Record<string, Record<string, unknown>>) => boolean, message?: string) {
  await expect
    .poll(
      async () => {
        const raw = await page.evaluate((k) => localStorage.getItem(k), `ptpt:v1:snap:${uid}`)
        if (!raw) return false
        return pred((JSON.parse(raw) as { docs: Record<string, Record<string, unknown>> }).docs)
      },
      { message },
    )
    .toBe(true)
}

/** Opens the app in `page`, signs `email` in and returns the uid (no wipe). */
export async function openSignedIn(page: Page, email: string, path = ''): Promise<string> {
  await page.goto(path)
  await expect(page.getByRole('button', { name: 'Войти через Google' })).toBeVisible()
  return signIn(page, email)
}

/** Fakes the tab being hidden / shown (document.visibilityState + visibilitychange). */
export async function setVisibility(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { value: s, configurable: true })
    Object.defineProperty(document, 'hidden', { value: s === 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
}
