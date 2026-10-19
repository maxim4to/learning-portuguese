/**
 * Personal dictionary store + hooks. Mount <WordsProvider> (WordsProvider.tsx) inside <RepositoryProvider>.
 *
 * A view over the app DataStore (src/data/store.ts): words + dictionary cards (`wordId` set) are derived from it
 * synchronously — no fetch of its own. Mutations go through `repo.saveWordBundle`, which the DataStore applies
 * optimistically (and rolls back on a failed commit).
 *
 *   const { status, words, counts } = useWords()
 *   const word = useWordByLexId('levantar-se#verb')
 *   const { saveWord } = useWordActions()
 *   const { undo } = await saveWord({ lexId, lemma, ru, pos, gender, source })
 */
import { createContext, useContext, useSyncExternalStore } from 'react'
import type { DataStore, SrsCard, WordCardMode, WordEntry, WordSource, WordStatus } from '@/data'
import { WORD_CARD_MODES } from '@/data/types.ts'
import { isNewCard, schedule, type ReviewRating } from '@/engine/fsrs'
import { bumpNewSeenToday } from '@/features/srs/newCardCounter'
import { listenText } from './audio.ts'
import { countByStatus, groupCardsByWord, wordStatus } from './status.ts'
import {
  commitWrite,
  deleteLegacyWordCards as deleteLegacy,
  invertWrite,
  isEmptyWrite,
  legacyWordCards,
  normalizeLemma,
  planAddSource,
  planApplyEnabledModes,
  planCardReviewed,
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
  /**
   * A dictionary card was rated and persisted elsewhere (ReviewSession): syncs the cache and creates the cards it
   * unlocks (staged unlock, `planCardReviewed`). Non-dictionary cards are ignored.
   */
  onCardReviewed(card: SrsCard, rating: ReviewRating): Promise<void>
  /**
   * Rates a dictionary card outside a review session («Учить новые», «Проверить себя»): schedules it, counts a new
   * card against today's limit, persists, unlocks next modes. Returns the updated card.
   */
  rateCard(card: SrsCard, rating: ReviewRating): Promise<SrsCard>
  /** Settings → card modes changed: suspend cards of switched-off modes, resume / unlock switched-on ones. */
  applyEnabledModes(enabled: readonly WordCardMode[], changed: readonly WordCardMode[]): Promise<WordActionResult>
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

/** Dictionary view over one DataStore. Created by WordsProvider; components use the hooks below. */
export class WordsStore {
  private snap: WordsSnapshot = snapshotOf({ words: [], cards: [] }, 'loading', null)
  private src: { words: unknown; cards: unknown; ready: boolean } | null = null
  readonly actions: WordActions
  private readonly repo: DataStore

  constructor(repo: DataStore) {
    this.repo = repo
    this.actions = {
      saveWords: async (inputs) => this.run(planSaveWords(this.state(), inputs, { enabledModes: this.enabledModes() })),
      saveWord: (input) => this.actions.saveWords([input]),
      updateWord: async (id, patch) => this.run(planUpdateWord(this.state(), id, patch, Date.now(), this.enabledModes() ?? WORD_CARD_MODES)),
      addSource: async (id, source) => this.run(planAddSource(this.state(), id, source)),
      deleteWords: async (ids) => this.run(planDeleteWords(this.state(), ids)),
      markKnown: async (id) => this.run(planMarkKnown(this.state(), id)),
      unmarkKnown: async (id) => this.run(planUnmarkKnown(this.state(), id, { enabledModes: this.enabledModes() })),
      // The DataStore already has the cards (written through it): nothing to sync.
      onCardsUpdated: () => {},
      onCardReviewed: async (card, rating) => {
        if (!card.wordId) return
        await this.unlockAfter(card, rating)
      },
      rateCard: async (card, rating) => {
        const now = Date.now()
        const updated = schedule(card, rating, now)
        if (isNewCard(card)) bumpNewSeenToday(now)
        await this.run({ words: [], write: { cards: [updated] } })
        await this.unlockAfter(updated, rating)
        return updated
      },
      applyEnabledModes: async (enabled, changed) => {
        const canListen = await this.listenMap(this.getSnapshot().words)
        return this.run(planApplyEnabledModes(this.state(), enabled, changed, { canListen: (w) => canListen.get(w.id) ?? false }))
      },
      reload: async () => {},
      countLegacyWordCards: async () => legacyWordCards(this.repo.cardList()).length,
      deleteLegacyWordCards: () => deleteLegacy(this.repo),
    }
  }

  subscribe = (cb: () => void) => this.repo.subscribe(cb)

  getSnapshot = (): WordsSnapshot => {
    const docs = this.repo.getDocs()
    const ready = this.repo.isReady()
    const src = this.src
    if (!src || src.words !== docs.words || src.cards !== docs.cards || src.ready !== ready) {
      this.src = { words: docs.words, cards: docs.cards, ready }
      this.snap = snapshotOf({ words: this.repo.wordList(), cards: this.repo.cardList().filter((c) => c.wordId) }, ready ? 'ready' : 'loading', null)
    }
    return this.snap
  }

  private state(): WordsState {
    const s = this.getSnapshot()
    return { words: s.words, cards: s.cards }
  }

  private enabledModes(): WordCardMode[] | undefined {
    return this.repo.settings().wordModes
  }

  /** Creates the cards unlocked by rating `card` (recognize only). Errors are swallowed: unlock retries next review. */
  private async unlockAfter(card: SrsCard, rating: ReviewRating): Promise<void> {
    if (!card.wordId || card.mode !== 'recognize') return
    const entry = this.getSnapshot().index.byId.get(card.wordId)
    if (!entry) return
    try {
      const canListen = await listenText(entry).then((t) => t !== null, () => false)
      await this.run(planCardReviewed(this.state(), card, rating, { enabledModes: this.enabledModes(), canListen }))
    } catch {
      // not fatal: the condition is re-checked after the next review
    }
  }

  /** Whether each word can be played (pt-PT voice or an mp3). */
  private async listenMap(words: readonly WordEntry[]): Promise<Map<string, boolean>> {
    const res = await Promise.all(words.map(async (w) => [w.id, (await listenText(w).catch(() => null)) !== null] as const))
    return new Map(res)
  }

  /** Commit through the DataStore (optimistic there; it rolls back on failure); returns entries and an undo. */
  private async run(plan: WordPlan): Promise<WordActionResult> {
    const before = this.state()
    const write = plan.write
    if (isEmptyWrite(write)) return { words: plan.words, undo: async () => {} }
    const inverse = invertWrite(before, write)
    await commitWrite(this.repo, write)
    return {
      words: plan.words,
      undo: async () => {
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
