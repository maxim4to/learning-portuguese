/**
 * Personal dictionary operations.
 *
 * Every mutation is a pure *planner* `plan*(state, …) → WordPlan` that returns the entries to
 * write and a `WordBundleWrite` (entries + cards + deletes). `commitWrite(repo, write)` persists
 * it atomically via `repo.saveWordBundle`; `applyWrite(state, write)` applies it to an in-memory
 * state (WordsProvider does both: optimistic cache update, then commit). `invertWrite` builds the
 * undo write for toasts.
 *
 * In React use the actions from `useWordActions()` (src/features/words/useWords.ts) — they wrap
 * these planners. Pure module (relative imports, no React) so scripts/words.test.ts can import it.
 *
 * Card ids are deterministic: `lex:<wordId>:<mode>`; word ids are `lexId` or `u:<normalized lemma>`.
 * Saving creates only the `recognize` (PT→RU) card; produce/cloze/listen are unlocked after reviews
 * (rules in status.ts → `readyModes`, card creation in `planUnlockNext` / `planCardReviewed`).
 */
import { createSrsCard } from '../../engine/fsrs.ts'
import {
  WORD_CARD_MODES,
  WORD_SOURCES_MAX,
  type ProgressRepository,
  type SrsCard,
  type WordBundleWrite,
  type WordCardMode,
  type WordEntry,
  type WordPos,
  type WordSource,
} from '../../data/types.ts'
import type { Level } from '../../content/schema.ts'
import { GAP, clozeSource } from './cloze.ts'
import { readyModes, type ModeContext } from './status.ts'
import type { ReviewRating } from '../../engine/fsrs.ts'

// ─── Ids ──────────────────────────────────────────────────────────────────────

/** NFC, lower case, trimmed, single spaces, typographic apostrophes/hyphens unified. */
export function normalizeLemma(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[’‘ʼ]/g, "'")
    .replace(/[‐‑‒–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Word id: the lexicon id when known, otherwise `u:<normalized lemma>`. */
export function wordIdFor(input: { lexId?: string; lemma: string }): string {
  return input.lexId ? input.lexId : `u:${normalizeLemma(input.lemma)}`
}

export const LEX_CARD_PREFIX = 'lex:'

/** Card id of a dictionary word's mode: `lex:<wordId>:<mode>`. */
export const wordCardId = (wordId: string, mode: WordCardMode) => `${LEX_CARD_PREFIX}${wordId}:${mode}`

/** Inverse of `wordCardId` (undefined for other ids). */
export function parseWordCardId(id: string): { wordId: string; mode: WordCardMode } | undefined {
  if (!id.startsWith(LEX_CARD_PREFIX)) return undefined
  const i = id.lastIndexOf(':')
  const mode = id.slice(i + 1) as WordCardMode
  const wordId = id.slice(LEX_CARD_PREFIX.length, i)
  return wordId && WORD_CARD_MODES.includes(mode) ? { wordId, mode } : undefined
}

// ─── Card faces ────────────────────────────────────────────────────────────────

const ARTICLE: Record<NonNullable<WordEntry['gender']>, string> = { m: 'o', f: 'a', mf: 'o/a' }
const HAS_ARTICLE = /^(o|a|os|as|o\/a)\s/i

/** pt display form: nouns get their article ('a saúde', 'o/a utente'). */
export function wordPt(entry: Pick<WordEntry, 'lemma' | 'pos' | 'gender'>): string {
  const isNoun = entry.pos === 'noun' || (entry.pos === undefined && entry.gender !== undefined)
  if (!isNoun || !entry.gender || HAS_ARTICLE.test(entry.lemma)) return entry.lemma
  return `${ARTICLE[entry.gender]} ${entry.lemma}`
}

const POS_SHORT: Record<WordPos, string> = {
  noun: 'сущ.',
  verb: 'гл.',
  adj: 'прил.',
  adv: 'нареч.',
  prep: 'предл.',
  pron: 'мест.',
  det: 'опред.',
  conj: 'союз',
  num: 'числ.',
  interj: 'межд.',
  phrase: 'фраза',
  other: '',
}
const GENDER_SHORT: Record<NonNullable<WordEntry['gender']>, string> = { m: 'м. р.', f: 'ж. р.', mf: 'м./ж. р.' }

/** Grammar hint for the RU→PT side: 'сущ., ж. р.' ('' when nothing is known). */
export function wordHint(entry: Pick<WordEntry, 'pos' | 'gender'>): string {
  return [entry.pos ? POS_SHORT[entry.pos] : '', entry.gender ? GENDER_SHORT[entry.gender] : ''].filter(Boolean).join(', ')
}

export { maskForm } from './cloze.ts'

/** Newest source that has a sentence (for cloze / examples). */
export function exampleSource(entry: Pick<WordEntry, 'sources'>): WordSource | undefined {
  for (let i = entry.sources.length - 1; i >= 0; i--) if (entry.sources[i].sentence?.trim()) return entry.sources[i]
  return undefined
}

/** front/back of a mode's card (also stored on the card for CardList search and orphan rendering). */
export function cardFaces(entry: WordEntry, mode: WordCardMode): { front: string; back: string } {
  const pt = wordPt(entry)
  switch (mode) {
    case 'recognize':
      return { front: pt, back: entry.ru }
    case 'produce': {
      const hint = wordHint(entry)
      return { front: hint ? `${entry.ru} (${hint})` : entry.ru, back: pt }
    }
    case 'listen':
      return { front: pt, back: `${pt} — ${entry.ru}` }
    case 'cloze': {
      const cz = clozeSource(entry)
      if (!cz) return { front: GAP, back: pt }
      return { front: cz.masked, back: cz.source.sentence ?? pt }
    }
  }
}

/**
 * New cards for `modes` (default: the initial `recognize`) that don't exist yet in `existing`.
 * cloze is skipped without a source sentence containing the form. Does not check unlock rules — see status.ts.
 */
export function buildCards(
  entry: WordEntry,
  modes: readonly WordCardMode[] = ['recognize'],
  existing: readonly SrsCard[] = [],
  now = Date.now(),
): SrsCard[] {
  const have = new Set(existing.map((c) => c.id))
  const out: SrsCard[] = []
  for (const mode of modes) {
    const id = wordCardId(entry.id, mode)
    if (have.has(id)) continue
    if (mode === 'cloze' && !clozeSource(entry)) continue
    have.add(id)
    out.push(createSrsCard({ id, kind: 'word', ...cardFaces(entry, mode), wordId: entry.id, mode }, now))
  }
  return out
}

/** Cards whose stored front/back no longer match the entry, with refreshed faces (FSRS kept). */
export function refreshCardFaces(entry: WordEntry, cards: readonly SrsCard[], now = Date.now()): SrsCard[] {
  const out: SrsCard[] = []
  for (const c of cards) {
    if (c.wordId !== entry.id || !c.mode) continue
    const f = cardFaces(entry, c.mode)
    if (f.front !== c.front || f.back !== c.back) out.push({ ...c, ...f, updatedAt: now })
  }
  return out
}

// ─── State, writes, undo ───────────────────────────────────────────────────────

/** In-memory dictionary state: all entries + (at least) all their cards. */
export interface WordsState {
  words: readonly WordEntry[]
  cards: readonly SrsCard[]
}

/** Result of a planner: entries as they will be after the write, and the write itself. */
export interface WordPlan {
  words: WordEntry[]
  write: WordBundleWrite
}

export const isEmptyWrite = (w: WordBundleWrite) =>
  !w.words?.length && !w.cards?.length && !w.deleteWordIds?.length && !w.deleteCardIds?.length

/** Applies a write to a state (sets, then deletes — same order as the repositories). */
export function applyWrite(state: WordsState, write: WordBundleWrite): WordsState {
  const words = new Map(state.words.map((w) => [w.id, w]))
  const cards = new Map(state.cards.map((c) => [c.id, c]))
  for (const w of write.words ?? []) words.set(w.id, w)
  for (const c of write.cards ?? []) cards.set(c.id, c)
  for (const id of write.deleteWordIds ?? []) words.delete(id)
  for (const id of write.deleteCardIds ?? []) cards.delete(id)
  return { words: [...words.values()], cards: [...cards.values()] }
}

/** The write that restores `state` after `write` was applied to it (for «Отменить»). */
export function invertWrite(state: WordsState, write: WordBundleWrite): WordBundleWrite {
  const words = new Map(state.words.map((w) => [w.id, w]))
  const cards = new Map(state.cards.map((c) => [c.id, c]))
  const restoreWords = new Map<string, WordEntry>()
  const restoreCards = new Map<string, SrsCard>()
  const dropWords = new Set<string>()
  const dropCards = new Set<string>()
  for (const id of [...(write.words ?? []).map((w) => w.id), ...(write.deleteWordIds ?? [])]) {
    const prev = words.get(id)
    if (prev) restoreWords.set(id, prev)
    else dropWords.add(id)
  }
  for (const id of [...(write.cards ?? []).map((c) => c.id), ...(write.deleteCardIds ?? [])]) {
    const prev = cards.get(id)
    if (prev) restoreCards.set(id, prev)
    else dropCards.add(id)
  }
  return {
    words: [...restoreWords.values()],
    cards: [...restoreCards.values()],
    deleteWordIds: [...dropWords],
    deleteCardIds: [...dropCards],
  }
}

/** Persists a write (no-op when empty). */
export async function commitWrite(repo: ProgressRepository, write: WordBundleWrite): Promise<void> {
  if (isEmptyWrite(write)) return
  await repo.saveWordBundle(write)
}

/** Drops `undefined` values (Firestore- and equality-friendly). */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

const joinRu = (ru: string | readonly string[]) =>
  (typeof ru === 'string' ? ru.split(/\s*;\s*/) : ru)
    .map((s) => s.trim())
    .filter(Boolean)
    .join('; ')

function addSourceTo(sources: readonly WordSource[], src: WordSource): WordSource[] {
  const rest = sources.filter((s) => !(s.src === src.src && s.form === src.form))
  return [...rest, clean({ ...src, sentence: src.sentence?.slice(0, 300) })].slice(-WORD_SOURCES_MAX)
}

/** Planner options shared by save / unmark. */
export interface PlanOptions {
  now?: number
  /** `Settings.wordModes`; the initial card is created only if 'recognize' is enabled. Default: all. */
  enabledModes?: readonly WordCardMode[]
}

/** Initial cards for an entry (Phase 1: recognize only), respecting mark/settings/entry.modes. */
function initialModes(entry: WordEntry, enabled: readonly WordCardMode[] = WORD_CARD_MODES): WordCardMode[] {
  if (entry.mark === 'known') return []
  return (['recognize'] as const).filter((m) => enabled.includes(m) && entry.modes.includes(m))
}

// ─── Planners ──────────────────────────────────────────────────────────────────

/** What a caller (lookup card, theme page, manual form, import) knows about a word to save. */
export interface NewWordInput {
  lexId?: string
  lemma: string
  /** Meanings: '; '-joined string or a list. */
  ru: string | readonly string[]
  pos?: WordPos
  gender?: 'm' | 'f' | 'mf'
  level?: Level
  note?: string
  tags?: string[]
  /** Where the word was met; `at` defaults to now. */
  source?: Omit<WordSource, 'at'> & { at?: number }
  /** «Знаю — не учить»: saved without cards. */
  mark?: 'known'
  /** Allowed modes (default: all four; staged unlock still applies). */
  modes?: WordCardMode[]
}

/**
 * Saves words: creates new entries (+ recognize card) or merges into existing ones
 * (adds the source, fills missing pos/gender/level/lexId/ru; keeps the learner's meanings, mark, FSRS).
 * Inputs resolving to the same id are merged. Existing non-known entries without cards get their recognize card.
 */
export function planSaveWords(state: WordsState, inputs: readonly NewWordInput[], opts: PlanOptions = {}): WordPlan {
  const now = opts.now ?? Date.now()
  const known = new Map(state.words.map((w) => [w.id, w]))
  const touched = new Map<string, WordEntry>()
  for (const input of inputs) {
    const id = wordIdFor(input)
    const prev = touched.get(id) ?? known.get(id)
    const source = input.source ? { ...input.source, at: input.source.at ?? now } : undefined
    const ru = joinRu(input.ru)
    let next: WordEntry
    if (!prev) {
      next = clean<WordEntry>({
        id,
        lexId: input.lexId,
        lemma: input.lemma.trim(),
        pos: input.pos,
        gender: input.gender,
        ru,
        note: input.note?.trim() || undefined,
        tags: input.tags?.length ? [...input.tags] : undefined,
        sources: source ? addSourceTo([], source) : [],
        level: input.level,
        mark: input.mark,
        modes: input.modes?.length ? [...input.modes] : [...WORD_CARD_MODES],
        createdAt: now,
        updatedAt: now,
      })
    } else {
      next = clean<WordEntry>({
        ...prev,
        lexId: prev.lexId ?? input.lexId,
        pos: prev.pos ?? input.pos,
        gender: prev.gender ?? input.gender,
        level: prev.level ?? input.level,
        ru: prev.ru || ru,
        note: prev.note ?? (input.note?.trim() || undefined),
        tags: input.tags?.length ? [...new Set([...(prev.tags ?? []), ...input.tags])] : prev.tags,
        sources: source ? addSourceTo(prev.sources, source) : prev.sources,
        updatedAt: now,
      })
    }
    touched.set(id, next)
  }
  const words = [...touched.values()]
  const cards = words.flatMap((w) => buildCards(w, initialModes(w, opts.enabledModes), state.cards, now))
  return { words, write: { words, cards } }
}

/** Editable fields. `undefined` clears an optional field; id/lexId/sources/createdAt are not editable here. */
export type WordPatch = Partial<Pick<WordEntry, 'lemma' | 'pos' | 'gender' | 'ru' | 'note' | 'tags' | 'level' | 'modes'>>

/**
 * Edits an entry; refreshes stored faces of its cards. Removing a mode from `modes` suspends that card
 * (progress kept); adding it back unsuspends it (unless the word is marked known, the mode is off in settings
 * or the card was paused by hand). Cards of modes the edit did not change keep their state.
 * The id does not change when the lemma is edited.
 */
export function planUpdateWord(
  state: WordsState,
  id: string,
  patch: WordPatch,
  now = Date.now(),
  enabledModes: readonly WordCardMode[] = WORD_CARD_MODES,
): WordPlan {
  const prev = state.words.find((w) => w.id === id)
  if (!prev) return { words: [], write: {} }
  const merged: WordEntry = { ...prev, ...patch, id: prev.id, updatedAt: now }
  if (patch.ru !== undefined) merged.ru = joinRu(patch.ru)
  if (patch.lemma !== undefined) merged.lemma = patch.lemma.trim() || prev.lemma
  if (patch.modes !== undefined) merged.modes = patch.modes.length ? [...new Set(patch.modes)] : ['recognize']
  for (const k of ['pos', 'gender', 'note', 'tags', 'level'] as const) {
    if (k in patch && patch[k] === undefined) delete merged[k]
  }
  const next = clean(merged)
  const own = state.cards.filter((c) => c.wordId === id)
  const changed = new Map<string, SrsCard>()
  for (const c of refreshCardFaces(next, own, now)) changed.set(c.id, c)
  if (patch.modes !== undefined) {
    // Only modes switched on/off by this edit: a card paused by hand in another mode stays paused.
    const toggled = WORD_CARD_MODES.filter((m) => prev.modes.includes(m) !== next.modes.includes(m))
    for (const c of own) {
      if (!c.mode || !toggled.includes(c.mode)) continue
      const base = changed.get(c.id) ?? c
      const want = shouldSuspend(next, c.mode, enabledModes) || !!base.pausedByUser
      if (!!base.suspended !== want) changed.set(c.id, clean({ ...base, suspended: want || undefined, updatedAt: now }))
    }
  }
  return { words: [next], write: { words: [next], cards: [...changed.values()] } }
}

/** Adds a context/source to an existing entry («Сохранить этот пример»). */
export function planAddSource(state: WordsState, id: string, source: WordSource, now = Date.now()): WordPlan {
  const prev = state.words.find((w) => w.id === id)
  if (!prev) return { words: [], write: {} }
  const next: WordEntry = { ...prev, sources: addSourceTo(prev.sources, source), updatedAt: now }
  // cloze faces depend on the newest sentence
  const cards = refreshCardFaces(next, state.cards, now)
  return { words: [next], write: { words: [next], cards } }
}

/** Deletes entries and all their cards (cached ones + every deterministic `lex:<id>:<mode>` id). */
export function planDeleteWords(state: WordsState, ids: readonly string[]): WordPlan {
  const set = new Set(ids)
  const cardIds = new Set(state.cards.filter((c) => c.wordId && set.has(c.wordId)).map((c) => c.id))
  for (const id of ids) for (const m of WORD_CARD_MODES) cardIds.add(wordCardId(id, m))
  return { words: [], write: { deleteWordIds: [...set], deleteCardIds: [...cardIds] } }
}

/** «Знаю»: `mark = 'known'`, all the word's cards suspended. */
export function planMarkKnown(state: WordsState, id: string, now = Date.now()): WordPlan {
  const prev = state.words.find((w) => w.id === id)
  if (!prev) return { words: [], write: {} }
  const next: WordEntry = { ...prev, mark: 'known', updatedAt: now }
  const cards = state.cards
    .filter((c) => c.wordId === id && !c.suspended)
    .map((c) => ({ ...c, suspended: true, updatedAt: now }))
  return { words: [next], write: { words: [next], cards } }
}

/** «Учить снова»: mark removed, cards of allowed modes unsuspended (not those paused by hand); recognize created if there are none. */
export function planUnmarkKnown(state: WordsState, id: string, opts: PlanOptions = {}): WordPlan {
  const now = opts.now ?? Date.now()
  const prev = state.words.find((w) => w.id === id)
  if (!prev) return { words: [], write: {} }
  const next = { ...prev, updatedAt: now }
  delete next.mark
  const own = state.cards.filter((c) => c.wordId === id)
  const cards: SrsCard[] = own
    .filter((c) => c.suspended && !c.pausedByUser && c.mode && !shouldSuspend(next, c.mode, opts.enabledModes ?? WORD_CARD_MODES))
    .map((c) => {
      const u = { ...c, updatedAt: now }
      delete u.suspended
      return u
    })
  if (own.length === 0) cards.push(...buildCards(next, initialModes(next, opts.enabledModes), [], now))
  return { words: [next], write: { words: [next], cards } }
}

// ─── Staged unlock (Phase 3) ─────────────────────────────────────────────────

/** Unlock context: settings + whether the word can be played (listen). */
export interface UnlockContext {
  now?: number
  /** `Settings.wordModes` (default: all). */
  enabledModes?: readonly WordCardMode[]
  /** Lemma audio (mp3 or a pt-PT voice) — per word, or one answer for all. Default: available. */
  canListen?: boolean | ((entry: WordEntry) => boolean)
}

const listenOk = (ctx: UnlockContext, entry: WordEntry) =>
  typeof ctx.canListen === 'function' ? ctx.canListen(entry) : ctx.canListen !== false

/**
 * `unlockNext`: creates the cards whose unlock condition is met now and that are allowed
 * (settings.wordModes, entry.modes, not marked known; cloze needs a sentence with the form, listen needs audio).
 * Rules (status.ts `unlockConditionMet`): produce after the first Good / Easy of recognize; cloze and listen once
 * recognize is in Review with stability ≥ 4 days. `rating` = the rating just given to recognize, if any.
 */
export function planUnlockNext(state: WordsState, wordId: string, ctx: UnlockContext & { rating?: ReviewRating } = {}): WordPlan {
  const entry = state.words.find((w) => w.id === wordId)
  if (!entry) return { words: [], write: {} }
  const own = state.cards.filter((c) => c.wordId === wordId)
  const modeCtx: ModeContext = { enabledModes: ctx.enabledModes, canListen: listenOk(ctx, entry), rating: ctx.rating }
  const cards = buildCards(entry, readyModes(entry, own, modeCtx), own, ctx.now ?? Date.now())
  return { words: [], write: cards.length ? { cards } : {} }
}

/**
 * `onCardReviewed`: after a dictionary card was rated (and persisted by the session), the cards it unlocks.
 * Only recognize ratings unlock anything; other cards and non-dictionary cards give an empty write.
 * `card` is the updated card (it is applied to the state before the rules run).
 */
export function planCardReviewed(state: WordsState, card: SrsCard, rating: ReviewRating, ctx: UnlockContext = {}): WordPlan {
  if (!card.wordId || card.mode !== 'recognize') return { words: [], write: {} }
  return planUnlockNext(applyWrite(state, { cards: [card] }), card.wordId, { ...ctx, rating })
}

/** A dictionary card should be suspended: word marked known, mode switched off for the word or in settings. */
export function shouldSuspend(entry: WordEntry | undefined, mode: WordCardMode, enabled: readonly WordCardMode[]): boolean {
  if (!entry) return false
  return entry.mark === 'known' || !entry.modes.includes(mode) || !enabled.includes(mode)
}

/**
 * Settings → «Виды карточек слова» changed: cards of switched-off modes are suspended (FSRS progress kept);
 * switching a mode back on resumes them (unless the word is marked known or the mode is off for that word) and
 * creates the cards that became ready meanwhile. Only cards of `changed` modes are touched (default: all modes),
 * so a card paused by hand in another mode stays paused; a card paused by hand (`pausedByUser`) is never resumed.
 */
export function planApplyEnabledModes(
  state: WordsState,
  enabled: readonly WordCardMode[],
  changed: readonly WordCardMode[] = WORD_CARD_MODES,
  ctx: Omit<UnlockContext, 'enabledModes'> = {},
): WordPlan {
  const now = ctx.now ?? Date.now()
  const byId = new Map(state.words.map((w) => [w.id, w]))
  const touched = new Set(changed)
  const cards: SrsCard[] = []
  for (const c of state.cards) {
    if (!c.wordId || !c.mode || !touched.has(c.mode)) continue
    const want = shouldSuspend(byId.get(c.wordId), c.mode, enabled) || !!c.pausedByUser
    if (!!c.suspended === want) continue
    const next: SrsCard = { ...c, updatedAt: now }
    if (want) next.suspended = true
    else delete next.suspended
    cards.push(next)
  }
  const after = applyWrite(state, { cards })
  const created = state.words
    .flatMap((w) => planUnlockNext(after, w.id, { ...ctx, now, enabledModes: enabled }).write.cards ?? [])
    .filter((c) => c.mode && touched.has(c.mode))
  const all = [...cards, ...created]
  return { words: [], write: all.length ? { cards: all } : {} }
}

// ─── Legacy cleanup (decision 2: no migration) ───────────────────────────────

/**
 * Legacy word cards created by «+ в повторение» on themes, situations and reading glossaries:
 * ids `w:*` and `g:*`. Phrase cards (`ph:*`), grammar, error and dictionary (`lex:*`) cards are kept.
 */
export function isLegacyWordCard(c: SrsCard): boolean {
  return !c.wordId && (c.id.startsWith('w:') || c.id.startsWith('g:'))
}

export const legacyWordCards = (cards: readonly SrsCard[]) => cards.filter(isLegacyWordCard)

/** One-time cleanup write: deletes all legacy word cards from `allCards` (pass `repo.getCards()`). */
export function planLegacyCleanup(allCards: readonly SrsCard[]): WordBundleWrite {
  return { deleteCardIds: legacyWordCards(allCards).map((c) => c.id) }
}

/** Loads all cards, deletes legacy word cards; returns how many were deleted. */
export async function deleteLegacyWordCards(repo: ProgressRepository): Promise<number> {
  const write = planLegacyCleanup(await repo.getCards())
  await commitWrite(repo, write)
  return write.deleteCardIds?.length ?? 0
}
