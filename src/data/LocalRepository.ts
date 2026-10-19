/**
 * Browser-only repository backed by localStorage (dependency-free).
 * Used when Firebase is not configured. Data is small (≤ a few MB).
 */
import {
  DEFAULT_SETTINGS,
  applyResult,
  newId,
  parseExportBundle,
  type ErrorEntry,
  type ErrorEntryInput,
  type ExportBundle,
  type ProgressRepository,
  type ResetOptions,
  type Settings,
  type SrsCard,
  type TopicProgress,
  type TopicResult,
  type WordBundleWrite,
  type WordEntry,
} from './types.ts'
import { LOCAL_SETTINGS_KEY, clearDeviceProgress, emitProgressReset } from './deviceProgress.ts'

const PREFIX = 'ptpt:v1:'
const K = {
  progress: PREFIX + 'progress',
  cards: PREFIX + 'cards',
  errors: PREFIX + 'errors',
  settings: LOCAL_SETTINGS_KEY,
  /** Record<wordId, WordEntry> */
  words: PREFIX + 'words',
} as const

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export class LocalRepository implements ProgressRepository {
  readonly kind = 'local' as const

  private progressMap(): Record<string, TopicProgress> {
    return read(K.progress, {})
  }
  private cardMap(): Record<string, SrsCard> {
    return read(K.cards, {})
  }
  private wordMap(): Record<string, WordEntry> {
    return read(K.words, {})
  }

  async getTopicProgress(topicId: string) {
    return this.progressMap()[topicId]
  }

  async saveTopicResult(result: TopicResult) {
    const all = this.progressMap()
    const next = applyResult(all[result.topicId], result)
    all[result.topicId] = next
    write(K.progress, all)
    return next
  }

  async getAllProgress() {
    return Object.values(this.progressMap())
  }

  async getCards() {
    return Object.values(this.cardMap())
  }

  async upsertCards(cards: SrsCard[]) {
    const all = this.cardMap()
    for (const c of cards) all[c.id] = c
    write(K.cards, all)
  }

  async deleteCards(ids: string[]) {
    if (ids.length === 0) return
    const all = this.cardMap()
    for (const id of ids) delete all[id]
    write(K.cards, all)
  }

  async getWords() {
    return Object.values(this.wordMap())
  }

  async upsertWords(words: WordEntry[]) {
    if (words.length === 0) return
    const all = this.wordMap()
    for (const w of words) all[w.id] = w
    write(K.words, all)
  }

  async deleteWords(ids: string[]) {
    if (ids.length === 0) return
    const all = this.wordMap()
    for (const id of ids) delete all[id]
    write(K.words, all)
  }

  /** Same order as Firestore: sets, then deletes. */
  async saveWordBundle(input: WordBundleWrite) {
    await this.upsertWords(input.words ?? [])
    await this.upsertCards(input.cards ?? [])
    await this.deleteWords(input.deleteWordIds ?? [])
    await this.deleteCards(input.deleteCardIds ?? [])
  }

  async logError(entry: ErrorEntryInput) {
    const e: ErrorEntry = { ...entry, id: newId() }
    const all = read<ErrorEntry[]>(K.errors, [])
    all.push(e)
    write(K.errors, all.slice(-2000))
    return e
  }

  async getErrors() {
    return read<ErrorEntry[]>(K.errors, []).sort((a, b) => b.at - a.at)
  }

  async getSettings(): Promise<Settings> {
    return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(K.settings, {}) }
  }

  async saveSettings(patch: Partial<Settings>) {
    const next = { ...(await this.getSettings()), ...patch }
    write(K.settings, next)
    return next
  }

  async resetProgress(opts: ResetOptions = {}) {
    if (opts.resetSettings) {
      localStorage.removeItem(K.settings)
    } else {
      // lastDiagnosticAt is progress, not a preference.
      const { lastDiagnosticAt: _drop, ...keep } = read<Partial<Settings>>(K.settings, {})
      if (_drop !== undefined) write(K.settings, keep)
    }
    for (const key of [K.progress, K.cards, K.errors, K.words]) localStorage.removeItem(key)
    clearDeviceProgress(opts)
    emitProgressReset()
  }

  async exportAll(): Promise<ExportBundle> {
    return {
      app: 'portugues-pt',
      version: 1,
      exportedAt: Date.now(),
      progress: await this.getAllProgress(),
      cards: await this.getCards(),
      errors: await this.getErrors(),
      settings: await this.getSettings(),
      words: await this.getWords(),
    }
  }

  async importAll(data: ExportBundle | string) {
    const b = parseExportBundle(data)
    const progress = this.progressMap()
    for (const p of b.progress) progress[p.topicId] = p
    write(K.progress, progress)
    await this.upsertCards(b.cards)
    const errors = new Map(read<ErrorEntry[]>(K.errors, []).map((e) => [e.id, e]))
    for (const e of b.errors) errors.set(e.id, e)
    write(K.errors, [...errors.values()])
    write(K.settings, b.settings)
    await this.upsertWords(b.words)
  }
}
