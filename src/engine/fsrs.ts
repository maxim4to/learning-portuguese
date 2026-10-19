/**
 * Thin wrapper over ts-fsrs for SRS cards stored as `SrsCard` (epoch-ms timestamps).
 * Default FSRS parameters, request_retention 0.9, short-term learning steps on (1m, 10m).
 */
import { Rating, State, createEmptyCard, fsrs, type Card, type Grade } from 'ts-fsrs'
// Relative (not '@/') so scripts/*.test.ts can import this module under tsx / tsconfig.node.
import type { CardKind, FsrsState, SrsCard, WordCardMode } from '../data/types.ts'

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy'
export const REVIEW_RATINGS: readonly ReviewRating[] = ['again', 'hard', 'good', 'easy']

const GRADE: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
}

const scheduler = fsrs({ request_retention: 0.9 })

type TimeInput = number | Date
const ms = (t: TimeInput) => (typeof t === 'number' ? t : t.getTime())

function toState(c: Card): FsrsState {
  const s: FsrsState = {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as FsrsState['state'],
  }
  // Firestore rejects `undefined` values — only set when present.
  if (c.last_review) s.last_review = c.last_review.getTime()
  return s
}

function toCard(s: FsrsState): Card {
  return {
    ...s,
    due: new Date(s.due),
    state: s.state as State,
    last_review: s.last_review !== undefined ? new Date(s.last_review) : undefined,
  }
}

/** Fresh FSRS state (state New, due now). */
export function newCardState(now: TimeInput = Date.now()): FsrsState {
  return toState(createEmptyCard(new Date(ms(now))))
}

export interface NewCardInput {
  id: string
  kind: CardKind
  front: string
  back: string
  topicId?: string
  exerciseId?: string
  /** Personal-dictionary card: id of its WordEntry. */
  wordId?: string
  /** Personal-dictionary card mode (with `wordId`). */
  mode?: WordCardMode
}

/** Builds a new SrsCard with an empty FSRS state. Optional fields are omitted when undefined (Firestore-safe). */
export function createSrsCard(input: NewCardInput, now: TimeInput = Date.now()): SrsCard {
  const t = ms(now)
  const card: SrsCard = {
    id: input.id,
    kind: input.kind,
    front: input.front,
    back: input.back,
    fsrs: newCardState(t),
    createdAt: t,
    updatedAt: t,
  }
  if (input.topicId) card.topicId = input.topicId
  if (input.exerciseId) card.exerciseId = input.exerciseId
  if (input.wordId) card.wordId = input.wordId
  if (input.mode) card.mode = input.mode
  return card
}

/** Applies a rating and returns the updated card (new object). */
export function schedule(card: SrsCard, rating: ReviewRating, now: TimeInput = Date.now()): SrsCard {
  const t = ms(now)
  const { card: next } = scheduler.next(toCard(card.fsrs), new Date(t), GRADE[rating])
  return { ...card, fsrs: toState(next), updatedAt: t }
}

export const isNewCard = (card: SrsCard) => card.fsrs.state === 0

/** Not suspended and due at `now` (new cards are due from creation). */
export function isDue(card: SrsCard, now: TimeInput = Date.now()): boolean {
  return !card.suspended && card.fsrs.due <= ms(now)
}

export interface DueOptions {
  /** Max cards in total. */
  limit?: number
  /** Max new (never reviewed) cards per day. Default 15. */
  newPerDay?: number
  /** New cards already introduced today (subtracted from `newPerDay`). */
  newSeenToday?: number
  /**
   * One card per dictionary word (`wordId`) per session / day. Default true.
   * - learning / relearning cards are never buried (they are mid-step);
   * - of the word's due Review cards only the most overdue one comes, and none if a sibling was already reviewed today
   *   or is in the session as a learning card;
   * - a new card comes only if no sibling is in the session and none was reviewed today.
   * Buried cards don't use the daily new-card allowance.
   */
  burySiblings?: boolean
  /** New dictionary cards (`wordId`) go before new theme / example cards within the daily limit. Default true. */
  preferPersonal?: boolean
  /** Only cards passing the filter (e.g. `(c) => !!c.wordId` for word-only review). */
  filter?: (card: SrsCard) => boolean
}

/** Local midnight of the day containing `t`. */
function dayStart(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Cards for a session: due review/learning cards (most overdue first), then new cards
 * (oldest first; dictionary words first with `preferPersonal`) up to the remaining daily allowance;
 * new cards are interleaved roughly every 4th position so a session doesn't end with a block of unknowns.
 * Siblings of one dictionary word are buried (see `DueOptions.burySiblings`).
 */
export function dueCards(cards: SrsCard[], now: TimeInput = Date.now(), opts: DueOptions = {}): SrsCard[] {
  const t = ms(now)
  const pool = opts.filter ? cards.filter(opts.filter) : cards
  const bury = opts.burySiblings ?? true
  const personalFirst = opts.preferPersonal ?? true
  let reviews = pool.filter((c) => !isNewCard(c) && isDue(c, t)).sort((a, b) => a.fsrs.due - b.fsrs.due)
  const newAllowance = Math.max(0, (opts.newPerDay ?? 15) - (opts.newSeenToday ?? 0))
  let fresh = pool
    .filter((c) => isNewCard(c) && isDue(c, t))
    .sort((a, b) => (personalFirst ? Number(!a.wordId) - Number(!b.wordId) : 0) || a.createdAt - b.createdAt)

  if (bury) {
    // Words with a card reviewed today (any card of the word, including filtered-out ones): id of each such card.
    const today = dayStart(t)
    const reviewedToday = new Map<string, Set<string>>()
    for (const c of cards) {
      if (!c.wordId || c.fsrs.last_review === undefined || c.fsrs.last_review < today) continue
      const set = reviewedToday.get(c.wordId) ?? new Set<string>()
      set.add(c.id)
      reviewedToday.set(c.wordId, set)
    }
    const siblingReviewedToday = (c: SrsCard) => [...(reviewedToday.get(c.wordId!) ?? [])].some((id) => id !== c.id)
    const taken = new Set<string>()
    // Learning / relearning cards first: never buried, but they occupy their word.
    for (const c of reviews) if (c.wordId && (c.fsrs.state === 1 || c.fsrs.state === 3)) taken.add(c.wordId)
    reviews = reviews.filter((c) => {
      if (!c.wordId || c.fsrs.state === 1 || c.fsrs.state === 3) return true
      if (taken.has(c.wordId) || siblingReviewedToday(c)) return false
      taken.add(c.wordId)
      return true
    })
    fresh = fresh.filter((c) => {
      if (!c.wordId) return true
      if (taken.has(c.wordId) || reviewedToday.has(c.wordId)) return false
      taken.add(c.wordId)
      return true
    })
  }
  fresh = fresh.slice(0, newAllowance)

  const out: SrsCard[] = []
  let r = 0
  let n = 0
  while (r < reviews.length || n < fresh.length) {
    const takeNew = n < fresh.length && (r >= reviews.length || (out.length + 1) % 4 === 0)
    out.push(takeNew ? fresh[n++] : reviews[r++])
  }
  return opts.limit !== undefined ? out.slice(0, opts.limit) : out
}

/** Russian short interval: "<1 мин", "10 мин", "3 ч", "4 д", "2 мес", "1,5 г". */
export function formatInterval(deltaMs: number): string {
  const min = Math.round(deltaMs / 60_000)
  if (min < 1) return '<1 мин'
  if (min < 60) return `${min} мин`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} ч`
  const d = Math.round(deltaMs / 86_400_000)
  if (d < 31) return `${d} д`
  const mo = d / 30.4
  if (mo < 12) return `${Math.round(mo)} мес`
  const y = Math.round((d / 365) * 10) / 10
  return `${String(y).replace('.', ',')} г`
}

/** Interval labels per rating for the review buttons. */
export function previewIntervals(card: SrsCard, now: TimeInput = Date.now()): Record<ReviewRating, string> {
  const t = ms(now)
  const preview = scheduler.repeat(toCard(card.fsrs), new Date(t))
  const out = {} as Record<ReviewRating, string>
  for (const r of REVIEW_RATINGS) out[r] = formatInterval(preview[GRADE[r]].card.due.getTime() - t)
  return out
}
