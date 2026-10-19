/**
 * Persistence contracts (user progress, SRS cards, error log, settings, personal dictionary).
 * Content (topics, exercises…) is static and NOT stored here — see src/content.
 *
 * All timestamps are epoch milliseconds (number) so that objects are
 * JSON- and Firestore-friendly without conversion.
 */
import type { Level } from '../content/schema.ts'

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
  /**
   * Stable id, e.g. `lex:<wordId>:<mode>` (personal dictionary), `ph:<situationId>:<i>`,
   * `error:<exerciseId>`; legacy word cards: `w:<themeOrSituationId>:<i>`, `g:<readingId>:<i>`.
   */
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
  /** Personal-dictionary card: id of its `WordEntry` (kind stays 'word'). */
  wordId?: string
  /** Personal-dictionary card mode (only together with `wordId`). */
  mode?: WordCardMode
}

// ─── Personal dictionary ─────────────────────────────────────────────────────

export type WordPos = 'noun' | 'verb' | 'adj' | 'adv' | 'prep' | 'pron' | 'det' | 'conj' | 'num' | 'interj' | 'phrase' | 'other'

/**
 * Card modes of a dictionary word (one SRS card per mode, id `lex:<wordId>:<mode>`).
 * recognize: pt → ru; produce: ru → pt; listen: audio → pt; cloze: source sentence with a gap.
 * Staged unlock: recognize on save; produce after recognize first reaches Review;
 * cloze/listen once recognize stability ≥ 4 days (see src/features/words/status.ts).
 */
export type WordCardMode = 'recognize' | 'produce' | 'listen' | 'cloze'
/** Unlock order (also the default `Settings.wordModes`). */
export const WORD_CARD_MODES: readonly WordCardMode[] = ['recognize', 'produce', 'cloze', 'listen']

/** Computed from the entry + its cards (never stored): see src/features/words/status.ts. */
export type WordStatus = 'new' | 'learning' | 'known' | 'paused'

export interface WordSource {
  /** encodeSource(PtSource), e.g. 'situation:no-cafe:dialogue:3'; 'manual' (or 'manual:tutor') for manual input. */
  src: string
  /** The form as seen: 'levanto-me'. */
  form: string
  /** pt sentence, ≤ 300 chars. */
  sentence?: string
  sentenceRu?: string
  at: number
}

export interface WordEntry {
  /** Deterministic: lexId ('levantar-se#verb') or 'u:<normalized lemma>' — one word = one document on all devices. */
  id: string
  lexId?: string
  lemma: string
  pos?: WordPos
  gender?: 'm' | 'f' | 'mf'
  /** Chosen/own meanings, joined with '; '. */
  ru: string
  note?: string
  tags?: string[]
  /** Newest last, max 5. */
  sources: WordSource[]
  /** From the lexicon. */
  level?: Level
  /** The learner marked the word as known (cards suspended / not created). */
  mark?: 'known'
  /** Card modes allowed for this word (staged unlock creates cards only for these). */
  modes: WordCardMode[]
  createdAt: number
  updatedAt: number
}

/** Max `WordEntry.sources` kept (oldest dropped). */
export const WORD_SOURCES_MAX = 5

/** One atomic write of dictionary entries + their cards (one Firestore batch when ≤ 450 ops). */
export interface WordBundleWrite {
  words?: WordEntry[]
  cards?: SrsCard[]
  deleteWordIds?: string[]
  deleteCardIds?: string[]
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
  /** Personal dictionary: tap on a pt word opens its card. */
  lookupOnTap: boolean
  /** Personal dictionary: underline saved words in pt texts. */
  highlightSavedWords: boolean
  /** Personal dictionary: card modes enabled globally (staged unlock respects this). */
  wordModes: WordCardMode[]
  /** Personal dictionary: RU→PT and listening cards are answered by typing. */
  typeWordAnswers: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  voice: 'female',
  rate: 1,
  lenientAccents: false,
  newCardsPerDay: 15,
  lookupOnTap: true,
  highlightSavedWords: true,
  wordModes: [...WORD_CARD_MODES],
  typeWordAnswers: true,
}

export interface ExportBundle {
  app: 'portugues-pt'
  version: 1
  exportedAt: number
  progress: TopicProgress[]
  cards: SrsCard[]
  errors: ErrorEntry[]
  settings: Settings
  /** Personal dictionary. Absent in files exported before the dictionary existed. */
  words?: WordEntry[]
}

/** What `parseExportBundle` returns: `words` always present (`[]` for old files). */
export type ParsedExportBundle = ExportBundle & { words: WordEntry[] }

export interface ResetOptions {
  /** Also reset Settings to DEFAULT_SETTINGS (default: keep them). */
  resetSettings?: boolean
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

  /** Personal dictionary entries (unordered). */
  getWords(): Promise<WordEntry[]>
  /** Insert or replace by `id`. Batched. */
  upsertWords(words: WordEntry[]): Promise<void>
  /** Hard-deletes entries by `id` (unknown ids ignored). Does NOT touch cards — wordOps does. */
  deleteWords(ids: string[]): Promise<void>
  /** Writes entries and cards together (Firestore: one batch per ≤ 450 ops; deletes applied after sets). */
  saveWordBundle(input: WordBundleWrite): Promise<void>

  /**
   * «Сбросить весь прогресс»: deletes topic progress (lessons, tests, diagnostic, tutor results), SRS cards,
   * the error log and the personal dictionary, plus per-device progress keys (see clearDeviceProgress).
   * Settings are kept (only `lastDiagnosticAt` is cleared) unless `resetSettings` is set.
   * Theme (a per-device preference) is never touched.
   */
  resetProgress(opts?: ResetOptions): Promise<void>

  exportAll(): Promise<ExportBundle>
  /** Accepts a bundle or its JSON string. Merges by id (incoming wins). Throws on invalid input. */
  importAll(data: ExportBundle | string): Promise<void>
}

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Minimal shape check for imported dictionary entries. */
function isWordEntryLike(w: unknown): w is WordEntry {
  if (!w || typeof w !== 'object') return false
  const o = w as Partial<WordEntry>
  return typeof o.id === 'string' && o.id !== '' && typeof o.lemma === 'string' && typeof o.ru === 'string'
}

/** Fills defaults an imported entry may lack (older/partial data). */
function normalizeWordEntry(w: WordEntry): WordEntry {
  return {
    ...w,
    sources: Array.isArray(w.sources) ? w.sources.slice(-WORD_SOURCES_MAX) : [],
    modes: Array.isArray(w.modes) && w.modes.length ? w.modes : ['recognize'],
    createdAt: Number(w.createdAt) || Date.now(),
    updatedAt: Number(w.updatedAt) || Number(w.createdAt) || Date.now(),
  }
}

/** Parses + minimally validates an export bundle. `words` defaults to `[]` (old files import fine). */
export function parseExportBundle(data: ExportBundle | string): ParsedExportBundle {
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
    words: Array.isArray(b.words) ? b.words.filter(isWordEntryLike).map(normalizeWordEntry) : [],
  }
}
