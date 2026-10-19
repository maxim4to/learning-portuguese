/**
 * Persistence contracts (user progress, SRS cards, error log, settings).
 * Content (topics, exercises…) is static and NOT stored here — see src/content.
 *
 * All timestamps are epoch milliseconds (number) so that objects are
 * JSON- and Firestore-friendly without conversion.
 */

/** red / yellow / green on the topic map. */
export type TopicStatus = 'not-started' | 'weak' | 'learning' | 'confident'

/** Where a result came from. */
export type ResultSource = 'lesson' | 'mini-test' | 'diagnostic' | 'review' | 'situation' | 'tutor'

export interface TopicResult {
  topicId: string
  correct: number
  total: number
  /** epoch ms */
  at: number
  source?: ResultSource
  /** Tutor sessions (`source: 'tutor'`): prompt mode id, e.g. 'explain', 'roleplay', 'daily'. */
  mode?: string
  /** Tutor sessions: learner's note (what to repeat / the agent's summary line). */
  note?: string
}

export interface TopicProgress {
  topicId: string
  status: TopicStatus
  attempts: number
  /** last result ratio 0..1 */
  lastPct: number
  /** best result ratio 0..1 */
  bestPct: number
  lastAt: number
  /** Most recent results, newest last (capped at 20). */
  history: TopicResult[]
}

/** Thresholds: < 0.6 weak, < 0.85 learning, otherwise confident. */
export function statusFromPct(pct: number | undefined): TopicStatus {
  if (pct === undefined) return 'not-started'
  if (pct < 0.6) return 'weak'
  if (pct < 0.85) return 'learning'
  return 'confident'
}

/** Applies a new result to (possibly missing) progress. Shared by all repository implementations. */
export function applyResult(prev: TopicProgress | undefined, r: TopicResult): TopicProgress {
  const pct = r.total > 0 ? r.correct / r.total : 0
  const history = [...(prev?.history ?? []), r].slice(-20)
  return {
    topicId: r.topicId,
    status: statusFromPct(pct),
    attempts: (prev?.attempts ?? 0) + 1,
    lastPct: pct,
    bestPct: Math.max(prev?.bestPct ?? 0, pct),
    lastAt: r.at,
    history,
  }
}

/**
 * Serialized ts-fsrs `Card` (Dates → epoch ms). Convert with
 * `{ ...s, due: new Date(s.due), last_review: s.last_review ? new Date(s.last_review) : undefined }`.
 */
export interface FsrsState {
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  /** ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning */
  state: 0 | 1 | 2 | 3
  last_review?: number
}

export type CardKind = 'word' | 'phrase' | 'grammar' | 'error'

export interface SrsCard {
  /** Stable id, e.g. `word:<vocabThemeId>:<pt>`, `ex:<exerciseId>`, `error:<exerciseId>`. */
  id: string
  kind: CardKind
  /** Prompt side (usually ru or a gap sentence). */
  front: string
  /** Answer side (pt-PT). */
  back: string
  topicId?: string
  exerciseId?: string
  fsrs: FsrsState
  createdAt: number
  updatedAt: number
  /** Suspended cards are skipped in reviews. */
  suspended?: boolean
}

export interface ErrorEntryInput {
  exerciseId: string
  topicId: string
  given: string
  expected: string
  at: number
}

export interface ErrorEntry extends ErrorEntryInput {
  id: string
}

export interface Settings {
  /** Preferred voice for speech fallback. */
  voice: 'male' | 'female'
  /** Audio playback rate: 0.75 | 1 | 1.25 typically. */
  rate: number
  /** Count accent-only mistakes as correct. */
  lenientAccents: boolean
  /** New SRS cards per day. */
  newCardsPerDay: number
  /** Last diagnostic completion (epoch ms). */
  lastDiagnosticAt?: number
}

export const DEFAULT_SETTINGS: Settings = {
  voice: 'female',
  rate: 1,
  lenientAccents: false,
  newCardsPerDay: 15,
}

export interface ExportBundle {
  app: 'portugues-pt'
  version: 1
  exportedAt: number
  progress: TopicProgress[]
  cards: SrsCard[]
  errors: ErrorEntry[]
  settings: Settings
}

export interface ProgressRepository {
  /** 'local' (browser storage) or 'firestore' (synced). */
  readonly kind: 'local' | 'firestore'

  getTopicProgress(topicId: string): Promise<TopicProgress | undefined>
  /** Records a finished lesson/test and returns the updated aggregate. */
  saveTopicResult(result: TopicResult): Promise<TopicProgress>
  getAllProgress(): Promise<TopicProgress[]>

  getCards(): Promise<SrsCard[]>
  /** Insert or replace by `id`. Batched. */
  upsertCards(cards: SrsCard[]): Promise<void>
  /** Hard-deletes cards by `id` (unknown ids are ignored). Batched. */
  deleteCards(ids: string[]): Promise<void>

  /** Returns the created entry (with generated id). */
  logError(entry: ErrorEntryInput): Promise<ErrorEntry>
  /** Newest first. */
  getErrors(): Promise<ErrorEntry[]>

  /** Always returns a full object (defaults merged). */
  getSettings(): Promise<Settings>
  saveSettings(patch: Partial<Settings>): Promise<Settings>

  exportAll(): Promise<ExportBundle>
  /** Accepts a bundle or its JSON string. Merges by id (incoming wins). Throws on invalid input. */
  importAll(data: ExportBundle | string): Promise<void>
}

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Parses + minimally validates an export bundle. */
export function parseExportBundle(data: ExportBundle | string): ExportBundle {
  const obj = typeof data === 'string' ? (JSON.parse(data) as unknown) : data
  if (!obj || typeof obj !== 'object') throw new Error('Неверный файл: ожидался JSON-объект')
  const b = obj as Partial<ExportBundle>
  if (b.app !== 'portugues-pt' || b.version !== 1) throw new Error('Неверный файл: это не экспорт Português PT (v1)')
  return {
    app: 'portugues-pt',
    version: 1,
    exportedAt: Number(b.exportedAt) || Date.now(),
    progress: Array.isArray(b.progress) ? b.progress : [],
    cards: Array.isArray(b.cards) ? b.cards : [],
    errors: Array.isArray(b.errors) ? b.errors : [],
    settings: { ...DEFAULT_SETTINGS, ...(b.settings ?? {}) },
  }
}
