/**
 * Personal dictionary: computed word status and staged card-mode unlock rules.
 * Pure functions (no React, relative imports) — also used by scripts/words.test.ts.
 *
 * Status lifecycle: new → learning → known (+ paused). Never stored, always derived from the
 * entry and its cards, so devices can't disagree.
 */
import { WORD_CARD_MODES, type SrsCard, type WordCardMode, type WordEntry, type WordStatus } from '../../data/types.ts'
import type { ReviewRating } from '../../engine/fsrs.ts'
import { clozeSource } from './cloze.ts'

/** A word counts as known automatically at this recognize/produce stability (days). */
export const KNOWN_STABILITY_DAYS = 21
/** cloze / listen unlock once recognize reaches this stability (days). */
export const LATE_UNLOCK_STABILITY_DAYS = 4

export const WORD_STATUS_LABEL: Record<WordStatus, string> = {
  new: 'Новое',
  learning: 'Учу',
  known: 'Знаю',
  paused: 'На паузе',
}

export const WORD_MODE_LABEL: Record<WordCardMode, string> = {
  recognize: 'PT → RU',
  produce: 'RU → PT',
  listen: 'На слух',
  cloze: 'Пропуск в предложении',
}

/** Cards that belong to the word (by `wordId`). */
export function cardsOfWord(wordId: string, cards: readonly SrsCard[]): SrsCard[] {
  return cards.filter((c) => c.wordId === wordId)
}

/**
 * Status of a word given ITS cards (pass `cardsOfWord(...)` or a pre-grouped list):
 * - known: `mark === 'known'`, or ≥ 2 modes created and every active card is in Review with stability ≥ 21 d;
 * - paused: has cards, all suspended, no mark;
 * - new: no card reviewed yet (all state 0, or no cards);
 * - learning: otherwise (a lapse on a "known" word drops it back here automatically).
 */
export function wordStatus(entry: Pick<WordEntry, 'mark'>, cards: readonly SrsCard[]): WordStatus {
  if (entry.mark === 'known') return 'known'
  const active = cards.filter((c) => !c.suspended)
  if (cards.length > 0 && active.length === 0) return 'paused'
  const modes = new Set(cards.map((c) => c.mode))
  if (
    modes.size >= 2 &&
    active.length > 0 &&
    active.every((c) => c.fsrs.state === 2 && c.fsrs.stability >= KNOWN_STABILITY_DAYS)
  ) {
    return 'known'
  }
  if (active.every((c) => c.fsrs.state === 0)) return 'new'
  return 'learning'
}

/** Groups cards by `wordId` (cards without it are skipped). */
export function groupCardsByWord(cards: readonly SrsCard[]): Map<string, SrsCard[]> {
  const out = new Map<string, SrsCard[]>()
  for (const c of cards) {
    if (!c.wordId) continue
    const list = out.get(c.wordId)
    if (list) list.push(c)
    else out.set(c.wordId, [c])
  }
  return out
}

/** `id → status` for all words. */
export function wordStatuses(words: readonly WordEntry[], cards: readonly SrsCard[]): Map<string, WordStatus> {
  const byWord = groupCardsByWord(cards)
  return new Map(words.map((w) => [w.id, wordStatus(w, byWord.get(w.id) ?? [])]))
}

export function countByStatus(statuses: Iterable<WordStatus>): Record<WordStatus, number> {
  const out: Record<WordStatus, number> = { new: 0, learning: 0, known: 0, paused: 0 }
  for (const s of statuses) out[s]++
  return out
}

// ─── Staged modes (rules; card creation: wordOps `planUnlockNext` / `planCardReviewed`) ─────────

/**
 * Per-mode state of a word:
 * - active: the card exists;
 * - ready: unlock condition met, card not created yet (created after the next review / by `planUnlockNext`);
 * - locked: condition not met yet;
 * - unavailable: needs data the word lacks (cloze without a source sentence, listen without audio/voice);
 * - disabled: switched off in `Settings.wordModes` or `entry.modes`, or the word is marked known.
 */
export type ModeState = 'active' | 'ready' | 'locked' | 'unavailable' | 'disabled'

export interface ModeContext {
  /** `Settings.wordModes` (default: all four). */
  enabledModes?: readonly WordCardMode[]
  /** Lemma audio available (pre-generated mp3 or a pt-PT voice). Default true. */
  canListen?: boolean
  /** Rating just given to the word's recognize card (Good / Easy unlocks produce at once). */
  rating?: ReviewRating
}

/** Short Russian description of each unlock condition (for UI hints). */
export const MODE_UNLOCK_HINT: Record<WordCardMode, string> = {
  recognize: 'создаётся сразу при добавлении',
  produce: 'после первого успешного повторения PT → RU',
  cloze: `когда PT → RU держится ≥ ${LATE_UNLOCK_STABILITY_DAYS} дней (нужен пример из источника)`,
  listen: `когда PT → RU держится ≥ ${LATE_UNLOCK_STABILITY_DAYS} дней`,
}

/**
 * Whether `mode`'s unlock condition is met (ignores settings / existing cards):
 * - produce: the first successful (Good / Easy) review of recognize. Without the rating at hand it is derived from
 *   the FSRS state: in Review / Relearning, or a learning step passed (New + Good → Learning, step 1);
 * - cloze, listen: recognize in Review (or Relearning) with stability ≥ 4 days.
 */
export function unlockConditionMet(mode: WordCardMode, recognize: SrsCard | undefined, rating?: ReviewRating): boolean {
  if (mode === 'recognize') return true
  if (!recognize) return false
  const f = recognize.fsrs
  if (mode === 'produce') return rating === 'good' || rating === 'easy' || f.state >= 2 || (f.state === 1 && f.learning_steps >= 1)
  return f.state >= 2 && f.stability >= LATE_UNLOCK_STABILITY_DAYS
}

export function modeStates(
  entry: Pick<WordEntry, 'modes' | 'mark' | 'sources' | 'lemma'>,
  cards: readonly SrsCard[],
  ctx: ModeContext = {},
): Record<WordCardMode, ModeState> {
  const enabled = new Set(ctx.enabledModes ?? WORD_CARD_MODES)
  const allowed = new Set(entry.modes)
  const byMode = new Map(cards.map((c) => [c.mode, c]))
  const recognize = byMode.get('recognize')
  const out = {} as Record<WordCardMode, ModeState>
  for (const mode of WORD_CARD_MODES) {
    if (byMode.has(mode)) out[mode] = 'active'
    else if (entry.mark === 'known' || !enabled.has(mode) || !allowed.has(mode)) out[mode] = 'disabled'
    else if ((mode === 'cloze' && !clozeSource(entry)) || (mode === 'listen' && ctx.canListen === false)) out[mode] = 'unavailable'
    else out[mode] = unlockConditionMet(mode, recognize, ctx.rating) ? 'ready' : 'locked'
  }
  return out
}

/** Modes whose card should be created now (state 'ready'), in unlock order. */
export function readyModes(
  entry: Pick<WordEntry, 'modes' | 'mark' | 'sources' | 'lemma'>,
  cards: readonly SrsCard[],
  ctx: ModeContext = {},
): WordCardMode[] {
  const states = modeStates(entry, cards, ctx)
  return WORD_CARD_MODES.filter((m) => states[m] === 'ready')
}
