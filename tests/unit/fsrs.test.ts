/**
 * engine/fsrs.ts: card creation, scheduling for every rating × state, due checks and the session picker
 * (`dueCards`): limits, daily allowance, sibling burying across local midnight / DST, personal-first ordering,
 * filters, interleaving, interval labels. scripts/words.test.ts covers the basic sibling / personal-first cases.
 *
 * Day boundaries use LOCAL time (`new Date(y, m, d, h)`), as dueCards does; the suite runs in Europe/Lisbon
 * (DST ends 2026-10-25 02:00 → 01:00), but every assertion is phrased in local time so it holds in any zone.
 */
import { describe, expect, test } from 'vitest'
import {
  createSrsCard,
  dueCards,
  formatInterval,
  isDue,
  isNewCard,
  newCardState,
  previewIntervals,
  REVIEW_RATINGS,
  schedule,
  type ReviewRating,
} from '@/engine/fsrs'
import type { SrsCard } from '@/data/types'
import { DAY, NOW, card, fsrs, fsrsNew } from '../fixtures/seed'

const MIN = 60_000
const ids = (cs: SrsCard[]) => cs.map((c) => c.id)
const review = (id: string, patch: Partial<SrsCard> = {}, fs: Parameters<typeof fsrs>[0] = {}): SrsCard =>
  card(id, { fsrs: fsrs(fs), ...patch })
const fresh = (id: string, patch: Partial<SrsCard> = {}): SrsCard => card(id, { fsrs: fsrsNew(), ...patch })
const wordCard = (wordId: string, mode: string, fs: SrsCard['fsrs'], patch: Partial<SrsCard> = {}): SrsCard =>
  card(`lex:${wordId}:${mode}`, { kind: 'word', wordId, mode: mode as SrsCard['mode'], fsrs: fs, ...patch })

describe('createSrsCard / newCardState', () => {
  test('a fresh card is New, due at creation, with no undefined optional fields (Firestore-safe)', () => {
    const c = createSrsCard({ id: 'x', kind: 'phrase', front: 'f', back: 'b' }, NOW)
    expect(c.fsrs.state).toBe(0)
    expect(c.fsrs.due).toBe(NOW)
    expect(c.fsrs.reps).toBe(0)
    expect(c.createdAt).toBe(NOW)
    expect(c.updatedAt).toBe(NOW)
    expect(Object.keys(c).sort()).toEqual(['back', 'createdAt', 'front', 'fsrs', 'id', 'kind', 'updatedAt'])
    expect('last_review' in c.fsrs).toBe(false)
    expect(Object.values(c.fsrs).every((v) => v !== undefined)).toBe(true)
  })

  test('optional fields are kept when given; empty strings are omitted', () => {
    const c = createSrsCard({ id: 'x', kind: 'word', front: 'f', back: 'b', topicId: 't', exerciseId: 'e', wordId: 'w', mode: 'cloze' }, NOW)
    expect(c).toMatchObject({ topicId: 't', exerciseId: 'e', wordId: 'w', mode: 'cloze' })
    const empty = createSrsCard({ id: 'y', kind: 'error', front: '', back: '', topicId: '', wordId: '' }, NOW)
    expect('topicId' in empty).toBe(false)
    expect('wordId' in empty).toBe(false)
  })

  test('accepts a Date as well as epoch ms', () => {
    expect(createSrsCard({ id: 'x', kind: 'phrase', front: 'f', back: 'b' }, new Date(NOW))).toEqual(
      createSrsCard({ id: 'x', kind: 'phrase', front: 'f', back: 'b' }, NOW),
    )
    expect(newCardState(new Date(NOW))).toEqual(newCardState(NOW))
  })

  test('isNewCard follows the FSRS state', () => {
    expect(isNewCard(fresh('a'))).toBe(true)
    expect(isNewCard(review('b'))).toBe(false)
  })
})

describe('schedule', () => {
  const base = createSrsCard({ id: 'x', kind: 'phrase', front: 'f', back: 'b' }, NOW)

  test.each([
    ['again', 1, 1 * MIN],
    ['hard', 1, 6 * MIN],
    ['good', 1, 10 * MIN],
  ] as const)('new card rated %s → Learning, short step', (rating, state, step) => {
    const next = schedule(base, rating, NOW)
    expect(next.fsrs.state).toBe(state)
    expect(next.fsrs.due - NOW).toBe(step)
    expect(next.fsrs.reps).toBe(1)
    expect(next.fsrs.last_review).toBe(NOW)
    expect(next.updatedAt).toBe(NOW)
  })

  test('new card rated easy graduates to Review at once (days, not minutes)', () => {
    const next = schedule(base, 'easy', NOW)
    expect(next.fsrs.state).toBe(2)
    expect(next.fsrs.due - NOW).toBeGreaterThanOrEqual(DAY)
  })

  test('returns a new object and never mutates the input', () => {
    const frozen = structuredClone(base)
    const next = schedule(base, 'good', NOW)
    expect(base).toEqual(frozen)
    expect(next).not.toBe(base)
    expect(next.fsrs).not.toBe(base.fsrs)
    expect(next.id).toBe(base.id)
    expect(next.createdAt).toBe(base.createdAt)
  })

  test('learning → good twice graduates to Review', () => {
    let c = schedule(base, 'good', NOW)
    c = schedule(c, 'good', c.fsrs.due)
    expect(c.fsrs.state).toBe(2)
    expect(c.fsrs.due - c.fsrs.last_review!).toBeGreaterThanOrEqual(DAY)
  })

  test('review card: again → Relearning with a lapse; good/easy push the due date out, easy furthest', () => {
    const r = review('r', {}, { due: NOW, last_review: NOW - 3 * DAY })
    const again = schedule(r, 'again', NOW)
    expect(again.fsrs.state).toBe(3)
    expect(again.fsrs.lapses).toBe(1)
    expect(again.fsrs.due - NOW).toBeLessThan(DAY)
    const due = Object.fromEntries(REVIEW_RATINGS.map((x) => [x, schedule(r, x, NOW).fsrs.due])) as Record<ReviewRating, number>
    expect(due.hard).toBeLessThanOrEqual(due.good)
    expect(due.good).toBeLessThan(due.easy)
    expect(due.again).toBeLessThan(due.hard)
  })

  test('relearning → good returns to Review', () => {
    const lapsed = schedule(review('r', {}, { due: NOW }), 'again', NOW)
    const back = schedule(lapsed, 'good', lapsed.fsrs.due)
    expect(back.fsrs.state).toBe(2)
  })

  test('Date and ms inputs schedule identically', () => {
    expect(schedule(base, 'hard', new Date(NOW))).toEqual(schedule(base, 'hard', NOW))
  })

  test('a stored Review card without last_review (old data) still schedules', () => {
    const legacy = review('r')
    delete legacy.fsrs.last_review
    const next = schedule(legacy, 'good', NOW)
    expect(next.fsrs.last_review).toBe(NOW)
    expect(next.fsrs.due).toBeGreaterThan(NOW)
  })

  test('reviewing long before due (early review) still yields a valid future due', () => {
    const r = review('r', {}, { due: NOW + 30 * DAY, last_review: NOW - DAY, stability: 40, scheduled_days: 31 })
    const next = schedule(r, 'good', NOW)
    expect(Number.isFinite(next.fsrs.due)).toBe(true)
    expect(next.fsrs.due).toBeGreaterThan(NOW)
  })
})

describe('isDue', () => {
  test('due exactly now is due; one ms later is not', () => {
    const c = review('a', {}, { due: NOW })
    expect(isDue(c, NOW)).toBe(true)
    expect(isDue(c, NOW - 1)).toBe(false)
    expect(isDue(c, new Date(NOW))).toBe(true)
  })
  test('suspended is never due', () => {
    expect(isDue(review('a', { suspended: true }), NOW + 100 * DAY)).toBe(false)
  })
})

describe('dueCards: basics, ordering, limits', () => {
  test('empty input → empty session', () => {
    expect(dueCards([], NOW)).toEqual([])
    expect(dueCards([], NOW, { limit: 10, newPerDay: 0 })).toEqual([])
  })

  test('reviews most overdue first; not-yet-due and suspended excluded', () => {
    const a = review('a', {}, { due: NOW - DAY })
    const b = review('b', {}, { due: NOW - 3 * DAY })
    const c = review('c', {}, { due: NOW + 1 })
    const d = review('d', { suspended: true }, { due: NOW - 10 * DAY })
    expect(ids(dueCards([a, b, c, d], NOW))).toEqual(['b', 'a'])
  })

  test('learning and relearning cards count as reviews (not as new)', () => {
    const l = review('l', {}, { state: 1, due: NOW - MIN })
    const rl = review('rl', {}, { state: 3, due: NOW - 2 * MIN })
    expect(ids(dueCards([l, rl], NOW, { newPerDay: 0 }))).toEqual(['rl', 'l'])
  })

  test('new cards: oldest first, interleaved at every 4th position, the tail after reviews run out', () => {
    const reviews = Array.from({ length: 6 }, (_, i) => review(`r${i}`, {}, { due: NOW - (10 - i) * MIN }))
    const news = [3, 1, 2].map((i) => fresh(`n${i}`, { createdAt: NOW - (10 - i) * DAY }))
    expect(ids(dueCards([...news, ...reviews], NOW))).toEqual(['r0', 'r1', 'r2', 'n1', 'r3', 'r4', 'r5', 'n2', 'n3'])
  })

  test('only new cards → all of them up to the allowance', () => {
    const news = Array.from({ length: 20 }, (_, i) => fresh(`n${i}`, { createdAt: NOW - i }))
    const out = dueCards(news, NOW)
    expect(out).toHaveLength(15) // default newPerDay
    expect(out[0].id).toBe('n19')
  })

  test('a new card created in the future (clock skew) is not due yet', () => {
    const later = createSrsCard({ id: 'later', kind: 'phrase', front: 'f', back: 'b' }, NOW + 5 * MIN)
    expect(dueCards([later], NOW)).toEqual([])
    expect(ids(dueCards([later], NOW + 5 * MIN))).toEqual(['later'])
  })

  test.each([
    [{ newPerDay: 0 }, 0],
    [{ newPerDay: 3, newSeenToday: 5 }, 0],
    [{ newPerDay: -4 }, 0],
    [{ newPerDay: 3, newSeenToday: -2 }, 5],
    [{ newPerDay: 2.5 }, 2],
  ])('allowance %o → %i new cards', (opts, n) => {
    const news = Array.from({ length: 10 }, (_, i) => fresh(`n${i}`, { createdAt: NOW - DAY + i }))
    expect(dueCards(news, NOW, opts)).toHaveLength(n)
  })

  test('reviews are never limited by the new-card allowance', () => {
    const reviews = Array.from({ length: 40 }, (_, i) => review(`r${i}`, {}, { due: NOW - i * MIN }))
    expect(dueCards(reviews, NOW, { newPerDay: 0 })).toHaveLength(40)
  })

  test('limit cuts the interleaved session (reviews first, so a small limit has no new cards)', () => {
    const reviews = Array.from({ length: 5 }, (_, i) => review(`r${i}`, {}, { due: NOW - (10 - i) * MIN }))
    const news = [fresh('n0'), fresh('n1')]
    expect(ids(dueCards([...reviews, ...news], NOW, { limit: 3 }))).toEqual(['r0', 'r1', 'r2'])
    expect(ids(dueCards([...reviews, ...news], NOW, { limit: 4 }))).toEqual(['r0', 'r1', 'r2', 'n0'])
    expect(dueCards([...reviews, ...news], NOW, { limit: 0 })).toEqual([])
    expect(dueCards([...reviews, ...news], NOW, { limit: 100 })).toHaveLength(7)
  })

  test('does not mutate or reorder the input array', () => {
    const input = [review('a', {}, { due: NOW - MIN }), review('b', {}, { due: NOW - DAY }), fresh('n')]
    const copy = structuredClone(input)
    dueCards(input, NOW)
    expect(input).toEqual(copy)
  })

  test('filter applies to reviews and new cards alike', () => {
    const theme = review('t', { kind: 'phrase', topicId: 'x' })
    const err = review('e', { kind: 'error' })
    const n = fresh('n', { kind: 'error' })
    expect(ids(dueCards([theme, err, n], NOW, { filter: (c) => c.kind === 'error' }))).toEqual(['e', 'n'])
  })

  test('preferPersonal: dictionary new cards first; ties by createdAt; off → strictly oldest first', () => {
    const theme = fresh('theme', { createdAt: NOW - 9 * DAY })
    const w1 = wordCard('w1', 'recognize', fsrsNew(), { createdAt: NOW - DAY })
    const w2 = wordCard('w2', 'recognize', fsrsNew(), { createdAt: NOW - 2 * DAY })
    expect(ids(dueCards([theme, w1, w2], NOW))).toEqual([w2.id, w1.id, 'theme'])
    expect(ids(dueCards([theme, w1, w2], NOW, { preferPersonal: false }))).toEqual(['theme', w2.id, w1.id])
  })

  test('large deck (10k cards) is fast and correct', () => {
    const many: SrsCard[] = []
    for (let i = 0; i < 5000; i++) many.push(review(`r${i}`, {}, { due: NOW - i * MIN }))
    for (let i = 0; i < 5000; i++) many.push(wordCard(`w${i}`, 'recognize', fsrsNew(), { createdAt: NOW - i }))
    const t0 = performance.now()
    const out = dueCards(many, NOW, { newPerDay: 20 })
    expect(performance.now() - t0).toBeLessThan(500)
    expect(out).toHaveLength(5020)
    expect(out[0].id).toBe('r4999')
  })

  test('duplicate ids in input are passed through (no dedupe) — callers key by id', () => {
    const a = review('a')
    expect(dueCards([a, { ...a }], NOW, { burySiblings: false })).toHaveLength(2)
  })
})

describe('dueCards: burying siblings around local midnight and DST', () => {
  // Local times on the DST-end day in Lisbon (2026-10-25 has 25 hours there).
  const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime()
  const sibs = (lastReview: number, now: number) => {
    const done = wordCard('w', 'recognize', fsrs({ due: now + 5 * DAY, last_review: lastReview }, now))
    const prod = wordCard('w', 'produce', fsrs({ due: now - DAY, last_review: now - 10 * DAY }, now))
    const listen = wordCard('w', 'listen', fsrsNew(now))
    return [done, prod, listen]
  }

  test('sibling reviewed one minute before local midnight does not bury; one at midnight does', () => {
    const now = local(19, 0, 30)
    expect(ids(dueCards(sibs(local(18, 23, 59), now), now))).toEqual(['lex:w:produce'])
    expect(ids(dueCards(sibs(local(19, 0, 0), now), now))).toEqual([])
  })

  test('on the 25-hour DST day: a review at 00:30 still counts as «today» at 23:30', () => {
    const now = local(25, 23, 30)
    expect(ids(dueCards(sibs(local(25, 0, 30), now), now))).toEqual([])
    // and the next local day frees the word again
    expect(ids(dueCards(sibs(local(25, 0, 30), local(26, 0, 5)), local(26, 0, 5)))).toEqual(['lex:w:produce'])
  })

  test('on the 23-hour DST day (spring forward): a review at 00:10 counts as today at 23:50', () => {
    const now = new Date(2026, 2, 29, 23, 50).getTime()
    expect(ids(dueCards(sibs(new Date(2026, 2, 29, 0, 10).getTime(), now), now))).toEqual([])
  })

  test('a filtered-out sibling reviewed today still buries (word-only filter excludes nothing here, theme filter does)', () => {
    const now = local(19, 12)
    const cards = sibs(local(19, 9), now)
    expect(dueCards(cards, now, { filter: (c) => c.mode !== 'recognize' })).toEqual([])
  })

  test('two learning cards of one word both come; they also block the word\'s review and new cards', () => {
    const now = local(19, 12)
    const l1 = wordCard('w', 'recognize', fsrs({ state: 1, due: now - MIN, last_review: now - 10 * MIN }, now))
    const l2 = wordCard('w', 'produce', fsrs({ state: 3, due: now - 2 * MIN, last_review: now - 10 * MIN }, now))
    const rev = wordCard('w', 'cloze', fsrs({ due: now - DAY }, now))
    const n = wordCard('w', 'listen', fsrsNew(now))
    expect(ids(dueCards([l1, l2, rev, n], now))).toEqual([l2.id, l1.id])
  })

  test('a learning card blocks its word even when sorted after the word\'s review card', () => {
    const now = local(19, 12)
    const rev = wordCard('w', 'cloze', fsrs({ due: now - 3 * DAY, last_review: now - 9 * DAY }, now))
    const learning = wordCard('w', 'recognize', fsrs({ state: 1, due: now - MIN, last_review: now - DAY }, now))
    expect(ids(dueCards([rev, learning], now))).toEqual([learning.id])
  })

  test('the card itself reviewed today (relearn shown again) does not bury itself', () => {
    const now = local(19, 12)
    const self = wordCard('w', 'recognize', fsrs({ due: now - MIN, last_review: now - 3 * 60 * MIN }, now))
    expect(ids(dueCards([self], now))).toEqual([self.id])
  })

  test('buried new siblings do not consume the allowance; one new per word', () => {
    const now = local(19, 12)
    const cards = ['a', 'b', 'c'].flatMap((w, i) =>
      (['recognize', 'produce', 'listen'] as const).map((m, j) => wordCard(w, m, fsrsNew(now), { createdAt: now - DAY + i * 10 + j })),
    )
    const out = dueCards(cards, now, { newPerDay: 3 })
    expect(ids(out)).toEqual(['lex:a:recognize', 'lex:b:recognize', 'lex:c:recognize'])
  })

  test('cards without wordId are never buried', () => {
    const now = local(19, 12)
    const a = review('a', {}, { due: now - DAY, last_review: now - MIN })
    const b = review('b', {}, { due: now - DAY, last_review: now - MIN })
    expect(dueCards([a, b], now)).toHaveLength(2)
  })
})

describe('formatInterval', () => {
  test.each([
    [-5 * MIN, '<1 мин'],
    [0, '<1 мин'],
    [29_999, '<1 мин'],
    [30_000, '1 мин'],
    [10 * MIN, '10 мин'],
    [59 * MIN, '59 мин'],
    [59.6 * MIN, '1 ч'],
    [3 * 60 * MIN, '3 ч'],
    [23.4 * 60 * MIN, '23 ч'],
    [23.6 * 60 * MIN, '1 д'],
    [4 * DAY, '4 д'],
    [30 * DAY, '30 д'],
    [31 * DAY, '1 мес'],
    [61 * DAY, '2 мес'],
    [364 * DAY, '12 мес'],
    [365 * DAY, '1 г'],
    [548 * DAY, '1,5 г'],
    [3650 * DAY, '10 г'],
  ])('%d ms → %s', (delta, label) => {
    expect(formatInterval(delta)).toBe(label)
  })
})

describe('previewIntervals', () => {
  test('new card: minutes for again/hard/good, days for easy; does not mutate', () => {
    const c = createSrsCard({ id: 'x', kind: 'phrase', front: 'f', back: 'b' }, NOW)
    const copy = structuredClone(c)
    const p = previewIntervals(c, NOW)
    expect(p).toEqual({ again: '1 мин', hard: '6 мин', good: '10 мин', easy: expect.stringMatching(/ д$/) })
    expect(c).toEqual(copy)
  })

  test('review card: labels match what schedule() then does', () => {
    const r = review('r', {}, { due: NOW, last_review: NOW - 10 * DAY, stability: 10, scheduled_days: 10 })
    const p = previewIntervals(r, new Date(NOW))
    for (const x of REVIEW_RATINGS) expect(p[x]).toBe(formatInterval(schedule(r, x, NOW).fsrs.due - NOW))
  })
})
