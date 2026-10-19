/**
 * Seed builders shared by Vitest and Playwright: plain data in the app's storage formats, so a test can start
 * from a known state without clicking through the app.
 *
 *   localEntries(seed)      → localStorage entries of LOCAL mode (LocalBackend / LocalRepository layout):
 *                              ptpt:v1:progress  Record<topicId, TopicProgress>
 *                              ptpt:v1:cards     Record<id, SrsCard>
 *                              ptpt:v1:words     Record<id, WordEntry>
 *                              ptpt:v1:errors    ErrorEntry[] (oldest first)
 *                              ptpt:v1:settings  Partial<Settings>
 *                              ptpt:v1:theme     'light' | 'dark' | 'system'
 *   snapshotEntries(uid, s) → Firebase mode device snapshot `ptpt:v1:snap:<uid>` (store.ts `Persisted`) and
 *                              the cached sign-in `ptpt:v1:auth-user` (optimistic auth on reload).
 *
 * Only type imports from src/ — this file is loaded by Playwright's own TS transform too.
 */
import type { ErrorEntry, FsrsState, Settings, SrsCard, TopicProgress, TopicResult, WordCardMode, WordEntry } from '../../src/data/types.ts'

export const DAY = 86_400_000
/** A fixed «now» for deterministic data (2026-10-19 12:00 UTC). Pass your own when testing due dates. */
export const NOW = Date.UTC(2026, 9, 19, 12)

export interface Seed {
  progress?: TopicProgress[]
  cards?: SrsCard[]
  words?: WordEntry[]
  errors?: ErrorEntry[]
  settings?: Partial<Settings>
  theme?: 'light' | 'dark' | 'system'
}

// ─── Builders ────────────────────────────────────────────────────────────────

export function progress(topicId: string, correct: number, total = 10, opts: { at?: number; source?: TopicResult['source'] } = {}): TopicProgress {
  const pct = total > 0 ? correct / total : 0
  const at = opts.at ?? NOW - DAY
  const status = pct < 0.6 ? 'weak' : pct < 0.85 ? 'learning' : 'confident'
  return {
    topicId,
    status,
    attempts: 1,
    lastPct: pct,
    bestPct: pct,
    lastAt: at,
    history: [{ topicId, correct, total, at, source: opts.source ?? 'lesson' }],
  }
}

/** FSRS state; defaults to a Review card due yesterday. */
export function fsrs(patch: Partial<FsrsState> = {}, now = NOW): FsrsState {
  return {
    due: now - DAY,
    stability: 3,
    difficulty: 5,
    elapsed_days: 3,
    scheduled_days: 3,
    learning_steps: 0,
    reps: 3,
    lapses: 0,
    state: 2,
    last_review: now - 4 * DAY,
    ...patch,
  }
}

/** A brand-new (never reviewed) FSRS state, due now. */
export function fsrsNew(now = NOW): FsrsState {
  return { due: now, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0 }
}

export function card(id: string, patch: Partial<SrsCard> = {}, now = NOW): SrsCard {
  return {
    id,
    kind: 'error',
    front: `front ${id}`,
    back: `back ${id}`,
    fsrs: fsrs({}, now),
    createdAt: now - 10 * DAY,
    updatedAt: now - 4 * DAY,
    ...patch,
  }
}

/** Personal-dictionary entry (id `u:<lemma>` unless `lexId` is given). */
export function word(lemma: string, ru: string, patch: Partial<WordEntry> = {}, now = NOW): WordEntry {
  const id = patch.lexId ?? patch.id ?? `u:${lemma}`
  return {
    id,
    lemma,
    ru,
    sources: [{ src: 'manual', form: lemma, at: now - DAY }],
    modes: ['recognize'],
    createdAt: now - DAY,
    updatedAt: now - DAY,
    ...patch,
  }
}

/** The SRS card of a dictionary word (`lex:<wordId>:<mode>`). */
export function wordCard(w: WordEntry, mode: WordCardMode = 'recognize', patch: Partial<SrsCard> = {}, now = NOW): SrsCard {
  return card(`lex:${w.id}:${mode}`, { kind: 'word', wordId: w.id, mode, front: w.lemma, back: w.ru, ...patch }, now)
}

export function errorEntry(id: string, patch: Partial<ErrorEntry> = {}, now = NOW): ErrorEntry {
  return { id, exerciseId: `ex-${id}`, topicId: 'a1-ser-estar', given: 'x', expected: 'y', at: now - DAY, ...patch }
}

// ─── Storage layouts ─────────────────────────────────────────────────────────

const P = 'ptpt:v1:'
const byId = <T extends { id: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x]))

/** localStorage entries for LOCAL mode (no Firebase). Keys absent from the seed are not written. */
export function localEntries(seed: Seed): Record<string, string> {
  const out: Record<string, string> = {}
  if (seed.progress?.length) out[P + 'progress'] = JSON.stringify(Object.fromEntries(seed.progress.map((p) => [p.topicId, p])))
  if (seed.cards?.length) out[P + 'cards'] = JSON.stringify(byId(seed.cards))
  if (seed.words?.length) out[P + 'words'] = JSON.stringify(byId(seed.words))
  if (seed.errors?.length) out[P + 'errors'] = JSON.stringify([...seed.errors].sort((a, b) => a.at - b.at))
  if (seed.settings) out[P + 'settings'] = JSON.stringify(seed.settings)
  if (seed.theme) out[P + 'theme'] = seed.theme
  return out
}

export interface SeedUser {
  uid: string
  email: string
  displayName?: string
}

/** Device snapshot (Firebase mode) of `user`, plus the cached sign-in so the app renders it optimistically. */
export function snapshotEntries(user: SeedUser, seed: Seed, savedAt = NOW): Record<string, string> {
  const docs = {
    progress: Object.fromEntries((seed.progress ?? []).map((p) => [p.topicId, p])),
    cards: byId(seed.cards ?? []),
    errors: byId(seed.errors ?? []),
    words: byId(seed.words ?? []),
    meta: seed.settings ? { settings: seed.settings } : {},
  }
  const out: Record<string, string> = {
    [`${P}snap:${user.uid}`]: JSON.stringify({ v: 1, savedAt, lastSyncedAt: null, docs }),
    [`${P}auth-user`]: JSON.stringify({ uid: user.uid, email: user.email, displayName: user.displayName ?? null, photoURL: null }),
  }
  if (seed.theme) out[P + 'theme'] = seed.theme
  return out
}

/** Writes entries into a Storage (jsdom / node MemoryStorage). */
export function applyEntries(storage: Storage, entries: Record<string, string>): void {
  for (const [k, v] of Object.entries(entries)) storage.setItem(k, v)
}
