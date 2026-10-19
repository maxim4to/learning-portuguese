/**
 * Shape checks for persisted documents — everything read from storage we don't control in this render:
 * localStorage (local mode, device snapshot), Firestore documents and backup files («Восстановить из файла»).
 *
 * Each `repair*` returns a document of the right shape (missing optional / defaultable fields filled in) or
 * `null` when it can't be used (no id, no FSRS state…). Callers drop `null`s, so one broken document never
 * takes the app down (white screen on every load) — the rest of the data stays usable.
 *
 * Hand-written guards instead of zod: this module is on the boot path of every page (zod would add ~50 kB
 * to the main bundle) and the shapes are small. Pure TS — no DOM, no React.
 */
import {
  DEFAULT_SETTINGS,
  WORD_CARD_MODES,
  WORD_SOURCES_MAX,
  statusFromPct,
  type CardKind,
  type ErrorEntry,
  type FsrsState,
  type Settings,
  type SrsCard,
  type TopicProgress,
  type TopicResult,
  type TopicStatus,
  type WordCardMode,
  type WordEntry,
  type WordSource,
} from './types.ts'

type Obj = Record<string, unknown>

const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)
const isStr = (x: unknown): x is string => typeof x === 'string'
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const num = (x: unknown, fallback: number) => (isNum(x) ? x : fallback)
const nonEmpty = (x: unknown): x is string => isStr(x) && x !== ''

const STATUSES: readonly TopicStatus[] = ['not-started', 'weak', 'learning', 'confident']
const KINDS: readonly CardKind[] = ['word', 'phrase', 'grammar', 'error']
const isMode = (x: unknown): x is WordCardMode => WORD_CARD_MODES.includes(x as WordCardMode)

function repairResult(x: unknown, topicId: string): TopicResult | null {
  if (!isObj(x) || !isNum(x.at)) return null
  const r: TopicResult = { ...(x as unknown as TopicResult), topicId: nonEmpty(x.topicId) ? x.topicId : topicId }
  r.correct = num(x.correct, 0)
  r.total = num(x.total, 0)
  return r
}

/** Topic progress; `id` is the document id (used when the document lacks `topicId`). */
export function repairProgress(x: unknown, id?: string): TopicProgress | null {
  if (!isObj(x)) return null
  const topicId = nonEmpty(x.topicId) ? x.topicId : id
  // Nothing to show without results: `{ topicId }` alone is not progress.
  if (!nonEmpty(topicId) || (!Array.isArray(x.history) && !isNum(x.lastPct))) return null
  const history = Array.isArray(x.history) ? x.history.map((r) => repairResult(r, topicId)).filter((r) => r !== null) : []
  const last = history[history.length - 1]
  const lastPct = num(x.lastPct, last && last.total > 0 ? last.correct / last.total : 0)
  return {
    ...(x as unknown as TopicProgress),
    topicId,
    status: STATUSES.includes(x.status as TopicStatus) ? (x.status as TopicStatus) : statusFromPct(lastPct),
    attempts: num(x.attempts, history.length),
    lastPct,
    bestPct: num(x.bestPct, lastPct),
    lastAt: num(x.lastAt, last?.at ?? 0),
    history,
  }
}

function repairFsrs(x: unknown): FsrsState | null {
  if (!isObj(x) || !isNum(x.due)) return null
  const state = [0, 1, 2, 3].includes(x.state as number) ? (x.state as FsrsState['state']) : 0
  const f: FsrsState = {
    ...(x as unknown as FsrsState),
    due: x.due,
    stability: num(x.stability, 0),
    difficulty: num(x.difficulty, 0),
    elapsed_days: num(x.elapsed_days, 0),
    scheduled_days: num(x.scheduled_days, 0),
    learning_steps: num(x.learning_steps, 0),
    reps: num(x.reps, 0),
    lapses: num(x.lapses, 0),
    state,
  }
  if (!isNum(f.last_review)) delete f.last_review
  return f
}

export function repairCard(x: unknown, id?: string): SrsCard | null {
  if (!isObj(x)) return null
  const cardId = nonEmpty(x.id) ? x.id : id
  const fsrs = repairFsrs(x.fsrs)
  if (!nonEmpty(cardId) || !fsrs) return null
  const createdAt = num(x.createdAt, num(x.updatedAt, 0))
  const c: SrsCard = {
    ...(x as unknown as SrsCard),
    id: cardId,
    kind: KINDS.includes(x.kind as CardKind) ? (x.kind as CardKind) : 'word',
    front: isStr(x.front) ? x.front : '',
    back: isStr(x.back) ? x.back : '',
    fsrs,
    createdAt,
    updatedAt: num(x.updatedAt, createdAt),
  }
  if (c.mode !== undefined && !isMode(c.mode)) delete c.mode
  if (c.wordId !== undefined && !nonEmpty(c.wordId)) delete c.wordId
  if (c.suspended !== undefined && typeof c.suspended !== 'boolean') c.suspended = !!c.suspended
  if (c.pausedByUser !== undefined && c.pausedByUser !== true) delete c.pausedByUser
  return c
}

export function repairError(x: unknown, id?: string): ErrorEntry | null {
  if (!isObj(x)) return null
  const errId = nonEmpty(x.id) ? x.id : id
  if (!nonEmpty(errId) || !isStr(x.exerciseId) || !isNum(x.at)) return null
  return {
    ...(x as unknown as ErrorEntry),
    id: errId,
    topicId: isStr(x.topicId) ? x.topicId : '',
    given: isStr(x.given) ? x.given : '',
    expected: isStr(x.expected) ? x.expected : '',
  }
}

function repairSource(x: unknown): WordSource | null {
  if (!isObj(x) || !isStr(x.src) || !isStr(x.form)) return null
  const s = { ...(x as unknown as WordSource), at: num(x.at, 0) }
  if (s.sentence !== undefined && !isStr(s.sentence)) delete s.sentence
  if (s.sentenceRu !== undefined && !isStr(s.sentenceRu)) delete s.sentenceRu
  return s
}

export function repairWord(x: unknown, id?: string): WordEntry | null {
  if (!isObj(x)) return null
  const wordId = nonEmpty(x.id) ? x.id : id
  if (!nonEmpty(wordId) || !isStr(x.lemma) || !isStr(x.ru)) return null
  const modes = Array.isArray(x.modes) ? [...new Set(x.modes.filter(isMode))] : []
  const createdAt = num(x.createdAt, 0) || Date.now()
  const w: WordEntry = {
    ...(x as unknown as WordEntry),
    id: wordId,
    sources: Array.isArray(x.sources) ? x.sources.map(repairSource).filter((s) => s !== null).slice(-WORD_SOURCES_MAX) : [],
    modes: modes.length ? modes : ['recognize'],
    createdAt,
    updatedAt: num(x.updatedAt, 0) || createdAt,
  }
  if (w.tags !== undefined) {
    if (Array.isArray(w.tags)) w.tags = w.tags.filter(isStr)
    else delete w.tags
  }
  return w
}

const SETTING_OK: { [K in keyof Settings]-?: (v: unknown) => boolean } = {
  voice: (v) => v === 'male' || v === 'female',
  rate: (v) => isNum(v) && v > 0 && v <= 4,
  lenientAccents: (v) => typeof v === 'boolean',
  newCardsPerDay: (v) => isNum(v) && v >= 0,
  lastDiagnosticAt: isNum,
  lookupOnTap: (v) => typeof v === 'boolean',
  highlightSavedWords: (v) => typeof v === 'boolean',
  wordModes: (v) => Array.isArray(v) && v.every(isMode),
  typeWordAnswers: (v) => typeof v === 'boolean',
}

/** Stored settings: only known keys with values of the right type (the rest falls back to defaults). */
export function repairSettings(x: unknown): Partial<Settings> {
  if (!isObj(x)) return {}
  const out: Partial<Record<keyof Settings, unknown>> = {}
  for (const k of Object.keys(SETTING_OK) as (keyof Settings)[]) {
    if (k in x && SETTING_OK[k](x[k])) out[k] = x[k]
  }
  return out as Partial<Settings>
}

export const fullSettings = (x: unknown): Settings => ({ ...DEFAULT_SETTINGS, ...repairSettings(x) })

// ─── collections ─────────────────────────────────────────────────────────────

/** Store collection → document repair (`meta` holds the settings document). */
export const REPAIR = {
  progress: repairProgress,
  cards: repairCard,
  errors: repairError,
  words: repairWord,
  meta: (x: unknown) => (isObj(x) ? repairSettings(x) : null),
} as const
export type RepairCol = keyof typeof REPAIR

const warned = new Set<string>()
/** Logs a dropped/broken document once per place and collection (not once per document or per render). */
export function warnOnce(where: string, col: string, detail?: unknown): void {
  const key = `${where}/${col}`
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`[data] ${where}: skipped malformed ${col} data`, detail ?? '')
}

/**
 * An id → document map with every document repaired; broken ones are dropped (logged once).
 * Anything that is not a plain object counts as an empty collection.
 */
export function repairCollection<C extends RepairCol>(
  col: C,
  raw: unknown,
  where: string,
): Record<string, NonNullable<ReturnType<(typeof REPAIR)[C]>>> {
  type Doc = NonNullable<ReturnType<(typeof REPAIR)[C]>>
  const out: Record<string, Doc> = {}
  if (raw === undefined) return out
  if (!isObj(raw)) {
    warnOnce(where, col, raw)
    return out
  }
  const fix = REPAIR[col] as (x: unknown, id?: string) => Doc | null
  let dropped = 0
  for (const [id, doc] of Object.entries(raw)) {
    const d = fix(doc, id)
    if (d) out[id] = d
    else dropped++
  }
  if (dropped) warnOnce(where, col, `${dropped} document(s)`)
  return out
}

/** A list of documents (backup file): repaired ones + how many were dropped. */
export function repairList<T>(raw: unknown, fix: (x: unknown) => T | null): { ok: T[]; skipped: number } {
  if (!Array.isArray(raw)) return { ok: [], skipped: 0 }
  const ok: T[] = []
  let skipped = 0
  for (const x of raw) {
    const d = fix(x)
    if (d) ok.push(d)
    else skipped++
  }
  return { ok, skipped }
}
