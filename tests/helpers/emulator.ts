/**
 * Firebase emulator helpers for tests/e2e/emulator (project demo-ptpt; Firestore :8080, Auth :9099).
 *
 * Users: the rules allow only listed emails, so tests draw from a fixed pool installed by globalSetup —
 *   e2e-w<worker>-a@example.test, e2e-w<worker>-b@example.test   (allowed; one pair per Playwright worker)
 *   e2e-denied@example.test                                       (signed in but NOT allowed → AccessDenied)
 * Tests in one worker run one at a time, so `workerUsers()` + `wipeUser()` in a beforeEach gives isolation.
 *
 * Firestore REST with `Authorization: Bearer owner` bypasses the rules (seed / inspect server state).
 */
import { readFileSync } from 'node:fs'
import { expect, type Page, type TestInfo } from '@playwright/test'

export const PROJECT_ID = 'demo-ptpt'
export const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
export const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'
const DOCS = `http://${FS_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }
export const COLLECTIONS = ['progress', 'cards', 'errors', 'words', 'meta'] as const

export const MAX_WORKERS = 16
export const DENIED_EMAIL = 'e2e-denied@example.test'
export const allowedEmails = () => Array.from({ length: MAX_WORKERS }, (_, i) => [`e2e-w${i}-a@example.test`, `e2e-w${i}-b@example.test`]).flat()

export function workerUsers(info: TestInfo): { a: string; b: string } {
  const i = info.parallelIndex
  if (i >= MAX_WORKERS) throw new Error(`parallelIndex ${i} ≥ MAX_WORKERS (${MAX_WORKERS}); raise the pool in tests/helpers/emulator.ts`)
  return { a: `e2e-w${i}-a@example.test`, b: `e2e-w${i}-b@example.test` }
}

// ─── Rules ───────────────────────────────────────────────────────────────────

const MARKER = /return\s+\[[^\]]*\];\s*\/\/\s*ALLOWED_EMAILS/

/** Installs the repo's firestore.rules into the emulator with ALLOWED_EMAILS = the test pool. */
export async function installRules(emails = allowedEmails()): Promise<void> {
  const raw = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')
  if (!MARKER.test(raw)) throw new Error('ALLOWED_EMAILS marker line not found in firestore.rules')
  const rules = raw.replace(MARKER, () => `return [${emails.map((e) => `'${e}'`).join(', ')}]; // ALLOWED_EMAILS`)
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT_ID}:securityRules`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }),
  })
  if (!r.ok) throw new Error(`installRules: ${r.status} ${await r.text()}`)
}

export async function clearFirestore(): Promise<void> {
  const r = await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' })
  if (!r.ok) throw new Error(`clearFirestore: ${r.status}`)
}

export async function clearAuth(): Promise<void> {
  const r = await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' })
  if (!r.ok) throw new Error(`clearAuth: ${r.status}`)
}

// ─── Firestore REST (owner) ──────────────────────────────────────────────────

type FsValue = Record<string, unknown>
function toValue(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } }
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, toValue(x)])) } }
}
function fromValue(v: FsValue): unknown {
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return Number(v.doubleValue)
  if ('stringValue' in v) return v.stringValue
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) return ((v.arrayValue as { values?: FsValue[] }).values ?? []).map(fromValue)
  if ('mapValue' in v) return fromFields((v.mapValue as { fields?: Record<string, FsValue> }).fields ?? {})
  return undefined
}
const fromFields = (f: Record<string, FsValue>) => Object.fromEntries(Object.entries(f).map(([k, x]) => [k, fromValue(x)]))

const path = (uid: string, col: string, id?: string) => `users/${uid}/${col}${id ? `/${encodeURIComponent(id)}` : ''}`

export async function fsSet(uid: string, col: string, id: string, data: object): Promise<void> {
  const r = await fetch(`${DOCS}/${path(uid, col, id)}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: (toValue(data) as { mapValue: { fields: object } }).mapValue.fields }) })
  if (!r.ok) throw new Error(`fsSet ${col}/${id}: ${r.status} ${await r.text()}`)
}

export async function fsGet<T = Record<string, unknown>>(uid: string, col: string, id: string): Promise<T | null> {
  const r = await fetch(`${DOCS}/${path(uid, col, id)}`, { headers: OWNER })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`fsGet ${col}/${id}: ${r.status}`)
  const j = (await r.json()) as { fields?: Record<string, FsValue> }
  return fromFields(j.fields ?? {}) as T
}

export async function fsList<T = Record<string, unknown>>(uid: string, col: string): Promise<(T & { __id: string })[]> {
  const r = await fetch(`${DOCS}/${path(uid, col)}?pageSize=1000`, { headers: OWNER })
  if (!r.ok) throw new Error(`fsList ${col}: ${r.status}`)
  const j = (await r.json()) as { documents?: { name: string; fields?: Record<string, FsValue> }[] }
  return (j.documents ?? []).map((d) => ({ ...(fromFields(d.fields ?? {}) as T), __id: decodeURIComponent(d.name.split('/').pop() ?? '') }))
}

/** Deletes every document of `uid` (all app collections). */
export async function wipeUser(uid: string): Promise<void> {
  for (const col of COLLECTIONS) {
    const r = await fetch(`${DOCS}/${path(uid, col)}?pageSize=1000`, { headers: OWNER })
    if (!r.ok) throw new Error(`wipeUser ${col}: ${r.status}`)
    const j = (await r.json()) as { documents?: { name: string }[] }
    // The raw stored id: app ids are stored encodeURIComponent'ed («w%3Acasa»), and fsList's decoded `__id` would
    // address another document («w:casa») — those cards used to survive the wipe and leak into the next test.
    for (const d of j.documents ?? []) {
      await fetch(`${DOCS}/${path(uid, col, d.name.split('/').pop() ?? '')}`, { method: 'DELETE', headers: OWNER })
    }
  }
}

// ─── Browser side ────────────────────────────────────────────────────────────

/**
 * Signs `email` in through the emulator hook (window.__emuSignIn, src/data/auth.ts) on the already opened app
 * page and waits for the signed-in UI. Returns the uid.
 */
export async function signIn(page: Page, email: string): Promise<string> {
  await page.waitForFunction(() => typeof (window as { __emuSignIn?: unknown }).__emuSignIn === 'function')
  const uid = await page.evaluate((e) => (window as unknown as { __emuSignIn(e: string): Promise<string> }).__emuSignIn(e), email)
  await expect(page.getByRole('navigation', { name: 'Основные разделы' })).toBeVisible()
  return uid
}

/** The sync indicator in Settings (`[data-sync-status]`: local | syncing | synced | offline | error). */
export const syncStatus = (page: Page) => page.locator('[data-sync-status]').first()

/** signIn + wipe the user's server data left by an earlier test in this worker (same email → same uid). */
export async function signInFresh(page: Page, email: string): Promise<string> {
  const uid = await signIn(page, email)
  await wipeUser(uid)
  return uid
}
