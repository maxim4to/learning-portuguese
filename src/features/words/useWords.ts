/**
 * Personal dictionary store + hooks. Mount <WordsProvider> (WordsProvider.tsx) inside <RepositoryProvider>.
 *
 * One `repo.getWords()` + one `repo.getCards()` per session (cards filtered to `wordId` ones are kept);
 * all mutations are optimistic: the in-memory state updates immediately, then `repo.saveWordBundle`
 * commits (on failure the state is reverted and the promise rejects).
 *
 *   const { status, words, counts } = useWords()
 *   const word = useWordByLexId('levantar-se#verb')
 *   const { saveWord } = useWordActions()
 *   const { undo } = await saveWord({ lexId, lemma, ru, pos, gender, source })
 */
import { createContext, useContext, useSyncExternalStore } from 'react'
import type { ProgressRepository, SrsCard, WordCardMode, WordEntry, WordSource, WordStatus } from '@/data'
import { countByStatus, groupCardsByWord, wordStatus } from './status.ts'
import {
  applyWrite,
  commitWrite,
  deleteLegacyWordCards as deleteLegacy,
  invertWrite,
  isEmptyWrite,
  legacyWordCards,
  normalizeLemma,
  planAddSource,
  planDeleteWords,
  planMarkKnown,
  planSaveWords,
  planUnmarkKnown,
  planUpdateWord,
  type NewWordInput,
  type WordPatch,
  type WordPlan,
  type WordsState,
} from './wordOps.ts'

export interface WordIndex {
  byId: ReadonlyMap<string, WordEntry>
  /** lexicon id → entry (entries without lexId are not here). */
  byLexId: ReadonlyMap<string, WordEntry>
  /** normalized lemma → entries (several when homographs differ by pos). For highlighting / manual lookup. */
  byLemma: ReadonlyMap<string, readonly WordEntry[]>
}

export interface WordsSnapshot {
  status: 'loading' | 'ready' | 'error'
  error: string | null
  /** Newest first (createdAt desc). */
  words: readonly WordEntry[]
  /** Dictionary cards only (`wordId` set). */
  cards: readonly SrsCard[]
  index: WordIndex
  cardsByWord: ReadonlyMap<string, readonly SrsCard[]>
  statuses: ReadonlyMap<string, WordStatus>
  counts: Record<WordStatus, number> & { total: number }
}

/** Result of a mutation: entries after the write and an undo (for the «Отменить» toast). */
export interface WordActionResult {
  words: WordEntry[]
  undo(): Promise<void>
}

export interface WordActions {
  /** Create or merge (adds source, keeps progress). Creates the PT→RU card for new, not-known words. */
  saveWords(inputs: readonly NewWordInput[]): Promise<WordActionResult>
  saveWord(input: NewWordInput): Promise<WordActionResult>
  updateWord(id: string, patch: WordPatch): Promise<WordActionResult>
  addSource(id: string, source: WordSource): Promise<WordActionResult>
  /** Deletes entries and their cards. */
  deleteWords(ids: readonly string[]): Promise<WordActionResult>
  /** «Знаю»: mark known, suspend cards. */
  markKnown(id: string): Promise<WordActionResult>
  /** «Учить снова»: unmark, unsuspend; creates PT→RU if the word has no cards. */
  unmarkKnown(id: string): Promise<WordActionResult>
  /** Sync the cache after cards were written elsewhere (e.g. ReviewSession → repo.upsertCards). No write. */
  onCardsUpdated(cards: readonly SrsCard[]): void
  /** Re-read words and cards from the repository. */
  reload(): Promise<void>
  /** Legacy `w:*` / `g:*` word cards (reads all cards). */
  countLegacyWordCards(): Promise<number>
  /** One-time cleanup (decision 2): deletes legacy `w:*` / `g:*` word cards; returns the count. */
  deleteLegacyWordCards(): Promise<number>
}

const EMPTY_CARDS: readonly SrsCard[] = []
const EMPTY_WORDS: readonly WordEntry[] = []

function snapshotOf(state: WordsState, status: WordsSnapshot['status'], error: string | null): WordsSnapshot {
  const words = [...state.words].sort((a, b) => b.createdAt - a.createdAt)
  const cardsByWord = groupCardsByWord(state.cards)
  const byId = new Map<string, WordEntry>()
  const byLexId = new Map<string, WordEntry>()
  const byLemma = new Map<string, WordEntry[]>()
  const statuses = new Map<string, WordStatus>()
  for (const w of words) {
    byId.set(w.id, w)
    if (w.lexId) byLexId.set(w.lexId, w)
    const key = normalizeLemma(w.lemma)
    const list = byLemma.get(key)
    if (list) list.push(w)
    else byLemma.set(key, [w])
    statuses.set(w.id, wordStatus(w, cardsByWord.get(w.id) ?? EMPTY_CARDS))
  }
  return {
    status,
    error,
    words,
    cards: state.cards,
    index: { byId, byLexId, byLemma },
    cardsByWord,
    statuses,
    counts: { ...countByStatus(statuses.values()), total: words.length },
  }
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** In-memory store for one repository. Created by WordsProvider; components use the hooks below. */
export class WordsStore {
  private snap: WordsSnapshot = snapshotOf({ words: [], cards: [] }, 'loading', null)
  private readonly listeners = new Set<() => void>()
  private loadSeq = 0
  readonly actions: WordActions
  private readonly repo: ProgressRepository

  constructor(repo: ProgressRepository) {
    this.repo = repo
    this.actions = {
      saveWords: async (inputs) => this.run(planSaveWords(this.state(), inputs, { enabledModes: await this.enabledModes() })),
      saveWord: (input) => this.actions.saveWords([input]),
      updateWord: async (id, patch) => this.run(planUpdateWord(this.state(), id, patch)),
      addSource: async (id, source) => this.run(planAddSource(this.state(), id, source)),
      deleteWords: async (ids) => this.run(planDeleteWords(this.state(), ids)),
      markKnown: async (id) => this.run(planMarkKnown(this.state(), id)),
      unmarkKnown: async (id) => this.run(planUnmarkKnown(this.state(), id, { enabledModes: await this.enabledModes() })),
      onCardsUpdated: (cards) => {
        const mine = cards.filter((c) => c.wordId)
        if (mine.length) this.set(applyWrite(this.state(), { cards: mine }))
      },
      reload: () => this.load(),
      countLegacyWordCards: async () => legacyWordCards(await this.repo.getCards()).length,
      deleteLegacyWordCards: () => deleteLegacy(this.repo),
    }
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }
  getSnapshot = () => this.snap

  private state(): WordsState {
    return { words: this.snap.words, cards: this.snap.cards }
  }
  private set(state: WordsState, status = this.snap.status, error = this.snap.error) {
    this.snap = snapshotOf(state, status, error)
    for (const l of this.listeners) l()
  }

  private async enabledModes(): Promise<WordCardMode[] | undefined> {
    try {
      return (await this.repo.getSettings()).wordModes
    } catch {
      return undefined
    }
  }

  async load(): Promise<void> {
    const seq = ++this.loadSeq
    try {
      const [words, cards] = await Promise.all([this.repo.getWords(), this.repo.getCards()])
      if (seq !== this.loadSeq) return
      this.set({ words, cards: cards.filter((c) => c.wordId) }, 'ready', null)
    } catch (e) {
      if (seq !== this.loadSeq) return
      this.set(this.state(), 'error', errMsg(e))
    }
  }

  /** Optimistic apply + commit; returns entries and an undo. */
  private async run(plan: WordPlan): Promise<WordActionResult> {
    const before = this.state()
    const write = plan.write
    if (isEmptyWrite(write)) return { words: plan.words, undo: async () => {} }
    const inverse = invertWrite(before, write)
    this.set(applyWrite(before, write))
    try {
      await commitWrite(this.repo, write)
    } catch (e) {
      this.set(applyWrite(this.state(), inverse))
      throw e
    }
    return {
      words: plan.words,
      undo: async () => {
        this.set(applyWrite(this.state(), inverse))
        await commitWrite(this.repo, inverse)
      },
    }
  }
}

export const WordsContext = createContext<WordsStore | null>(null)

function useStore(): WordsStore {
  const store = useContext(WordsContext)
  if (!store) throw new Error('Words hooks must be used inside <WordsProvider>')
  return store
}

function useSnap<T>(select: (s: WordsSnapshot) => T): T {
  const store = useStore()
  return useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()))
}

/** Whole dictionary: `{ status, error, words (newest first), cards, statuses, counts, index, cardsByWord }`. */
export function useWords(): WordsSnapshot {
  return useSnap((s) => s)
}

/** Entry by id (undefined while loading or if missing). */
export function useWord(id: string | undefined): WordEntry | undefined {
  return useSnap((s) => (id ? s.index.byId.get(id) : undefined))
}

/** Entry saved for a lexicon id (e.g. to show «в словаре» on theme pages). */
export function useWordByLexId(lexId: string | undefined): WordEntry | undefined {
  return useSnap((s) => (lexId ? s.index.byLexId.get(lexId) : undefined))
}

/** Entries with this lemma (any pos; normalized comparison). */
export function useWordsByLemma(lemma: string | undefined): readonly WordEntry[] {
  return useSnap((s) => (lemma ? (s.index.byLemma.get(normalizeLemma(lemma)) ?? EMPTY_WORDS) : EMPTY_WORDS))
}

/** Lookup maps (byId / byLexId / byLemma) — for highlighting saved words and «в словаре» checks. */
export function useWordIndex(): WordIndex {
  return useSnap((s) => s.index)
}

/** Cards of a word (cached; stable reference between unrelated updates). */
export function useWordCards(id: string | undefined): readonly SrsCard[] {
  return useSnap((s) => (id ? (s.cardsByWord.get(id) ?? EMPTY_CARDS) : EMPTY_CARDS))
}

/** Computed status of a word (undefined if not saved). */
export function useWordStatus(id: string | undefined): WordStatus | undefined {
  return useSnap((s) => (id ? s.statuses.get(id) : undefined))
}

/** Mutations (stable object). */
export function useWordActions(): WordActions {
  return useStore().actions
}
