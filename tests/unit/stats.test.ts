/**
 * features/dashboard/stats.ts — local-day keys, streak, weekly activity («Цель дня» reads today's bucket), level
 * progress, suggestions. Day logic is local-time: the file pins TZ=Europe/Lisbon (as the e2e config does) and builds
 * timestamps with the local Date constructor; one block re-runs the streak in other zones.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { getSyllabus, listTopics } from '@/content'
import type { SrsCard, TopicProgress, TopicResult } from '@/data/types.ts'
import { activityDays, computeStreak, dayKey, levelStats, primarySuggestion, startOfDay, suggestTopics, weeklyActivity } from '@/features/dashboard/stats'
import { card, errorEntry, fsrs, NOW, progress } from '../fixtures/seed'

const ORIGINAL_TZ = process.env.TZ
// Set at module load (describe bodies below build timestamps at collection time).
process.env.TZ = 'Europe/Lisbon'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

/** Local time (current process TZ). Month is 1-based here. */
const at = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
const res = (topicId: string, t: number, source: TopicResult['source'] = 'lesson'): TopicResult => ({ topicId, correct: 1, total: 1, at: t, source })
const withHistory = (topicId: string, ...ts: number[]): TopicProgress => ({ ...progress(topicId, 1, 1, { at: ts[ts.length - 1] }), history: ts.map((t) => res(topicId, t)) })
const reviewed = (id: string, t: number): SrsCard => card(id, { fsrs: fsrs({ last_review: t }) })
const pmap = (...ps: TopicProgress[]) => new Map(ps.map((p) => [p.topicId, p]))
const daysOf = (...ts: number[]) => new Set(ts.map(dayKey))

describe('dayKey / startOfDay', () => {
  it('local YYYY-MM-DD with zero padding; accepts Date', () => {
    expect(dayKey(at(2026, 1, 5, 0, 0))).toBe('2026-01-05')
    expect(dayKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })
  it('local midnight boundary: 23:59:59.999 and 00:00 are different days', () => {
    const midnight = at(2026, 10, 20, 0, 0)
    expect(dayKey(midnight - 1)).toBe('2026-10-19')
    expect(dayKey(midnight)).toBe('2026-10-20')
  })
  it('Lisbon summer time: 23:30 UTC is already the next local day', () => {
    expect(dayKey(Date.UTC(2026, 6, 1, 23, 30))).toBe('2026-07-02')
    expect(dayKey(Date.UTC(2026, 0, 1, 23, 30))).toBe('2026-01-01') // winter: UTC+0
  })
  it('startOfDay → local midnight, also on DST days (23 h / 25 h days)', () => {
    expect(startOfDay(at(2026, 10, 19, 15))).toBe(at(2026, 10, 19, 0))
    expect(startOfDay(at(2026, 3, 29, 15))).toBe(at(2026, 3, 29, 0))
    expect(startOfDay(at(2026, 10, 25, 15))).toBe(at(2026, 10, 25, 0))
    expect(at(2026, 3, 30, 0) - startOfDay(at(2026, 3, 29, 15))).toBe(23 * 3600_000)
    expect(at(2026, 10, 26, 0) - startOfDay(at(2026, 10, 25, 15))).toBe(25 * 3600_000)
  })
  it('startOfDay defaults to now', () => {
    const s = startOfDay()
    expect(s).toBeLessThanOrEqual(Date.now())
    expect(Date.now() - s).toBeLessThan(25 * 3600_000)
  })
})

describe('activityDays', () => {
  it('collects history, lastAt, card reviews and logged errors; duplicates collapse', () => {
    const p = withHistory('t', at(2026, 10, 1), at(2026, 10, 1, 18), at(2026, 10, 2))
    p.lastAt = at(2026, 10, 3)
    const cards = [reviewed('c1', at(2026, 10, 4)), card('new', { fsrs: { ...fsrs(), last_review: undefined } })]
    const errs = [errorEntry('e', { at: at(2026, 10, 5) })]
    expect([...activityDays([p], cards, errs)].sort()).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'])
  })
  it('empty data → empty set; errors optional; lastAt 0 ignored', () => {
    expect(activityDays([], []).size).toBe(0)
    expect(activityDays([{ ...withHistory('t'), lastAt: 0 }], []).size).toBe(0)
  })
})

describe('computeStreak', () => {
  const now = at(2026, 10, 19, 12)
  it('no activity → 0', () => {
    expect(computeStreak(new Set(), now)).toEqual({ streak: 0, activeToday: false })
  })
  it('counts consecutive days ending today', () => {
    expect(computeStreak(daysOf(at(2026, 10, 19, 8), at(2026, 10, 18), at(2026, 10, 17)), now)).toEqual({ streak: 3, activeToday: true })
  })
  it('nothing yet today: the streak ending yesterday is kept', () => {
    expect(computeStreak(daysOf(at(2026, 10, 18), at(2026, 10, 17)), now)).toEqual({ streak: 2, activeToday: false })
  })
  it('a gap breaks the streak; older activity does not count', () => {
    expect(computeStreak(daysOf(at(2026, 10, 19), at(2026, 10, 17), at(2026, 10, 16)), now).streak).toBe(1)
    expect(computeStreak(daysOf(at(2026, 10, 17)), now).streak).toBe(0)
  })
  it('several entries the same day count once', () => {
    expect(computeStreak(daysOf(at(2026, 10, 19, 1), at(2026, 10, 19, 23), at(2026, 10, 18, 0, 5), at(2026, 10, 18, 23, 55)), now).streak).toBe(2)
  })
  it('future timestamps (clock skew) neither start nor extend the streak', () => {
    expect(computeStreak(daysOf(at(2026, 10, 20), at(2026, 10, 21)), now)).toEqual({ streak: 0, activeToday: false })
    expect(computeStreak(daysOf(at(2026, 10, 20), at(2026, 10, 19)), now).streak).toBe(1)
  })
  it('just after local midnight: yesterday-evening work keeps the streak alive', () => {
    const justAfter = at(2026, 10, 20, 0, 1)
    expect(computeStreak(daysOf(at(2026, 10, 19, 23, 59), at(2026, 10, 18)), justAfter)).toEqual({ streak: 2, activeToday: false })
  })
  it('across the spring-forward night (29 Mar 2026, 23-hour day)', () => {
    const days = daysOf(at(2026, 3, 27, 23, 30), at(2026, 3, 28, 23, 30), at(2026, 3, 29, 23, 30), at(2026, 3, 30, 0, 30))
    expect(computeStreak(days, at(2026, 3, 30, 0, 30))).toEqual({ streak: 4, activeToday: true })
    expect(computeStreak(days, at(2026, 3, 30, 23, 59))).toEqual({ streak: 4, activeToday: true })
  })
  it('across the fall-back night (25 Oct 2026, 25-hour day)', () => {
    const days = daysOf(at(2026, 10, 23, 0, 10), at(2026, 10, 24, 0, 10), at(2026, 10, 25, 0, 10), at(2026, 10, 26, 0, 10))
    expect(computeStreak(days, at(2026, 10, 26, 0, 30))).toEqual({ streak: 4, activeToday: true })
    // 01:30 on 25 Oct happens twice; still one day.
    expect(computeStreak(daysOf(at(2026, 10, 25, 1, 30), at(2026, 10, 24, 23)), at(2026, 10, 25, 23, 59)).streak).toBe(2)
  })
  it('a long streak (400 days) walks back across both DST changes', () => {
    const ts: number[] = []
    for (let i = 0; i < 400; i++) ts.push(new Date(2026, 9, 19 - i, 9).getTime())
    expect(computeStreak(daysOf(...ts), now).streak).toBe(400)
  })
  it('defaults to Date.now()', () => {
    expect(computeStreak(daysOf(Date.now())).activeToday).toBe(true)
  })

  for (const tz of ['Pacific/Auckland', 'America/Sao_Paulo', 'Asia/Kolkata', 'UTC']) {
    it(`same local-day semantics in ${tz}`, () => {
      const prev = process.env.TZ
      process.env.TZ = tz
      try {
        const n = at(2026, 10, 19, 0, 30)
        const days = daysOf(at(2026, 10, 18, 23, 45), at(2026, 10, 17, 0, 15), at(2026, 10, 19, 0, 5))
        expect(computeStreak(days, n)).toEqual({ streak: 3, activeToday: true })
        expect(dayKey(n)).toBe('2026-10-19')
      } finally {
        process.env.TZ = prev
      }
    })
  }
})

describe('weeklyActivity (feeds «Цель дня»: today.results / today.reviews)', () => {
  const now = at(2026, 10, 19, 12)
  it('7 local days, oldest first, Russian weekday labels, today flagged', () => {
    const w = weeklyActivity([], [], now)
    expect(w.map((d) => d.day)).toEqual(['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19'])
    expect(w.map((d) => d.isToday)).toEqual([false, false, false, false, false, false, true])
    expect(w[6].label).toBe('пн')
    expect(w.every((d) => d.results === 0 && d.reviews === 0)).toBe(true)
  })
  it('counts every result entry (same-day duplicates too) and reviewed cards by local day', () => {
    const p1 = withHistory('a', at(2026, 10, 19, 0, 0), at(2026, 10, 19, 23, 59), at(2026, 10, 18, 23, 59))
    const p2 = withHistory('b', at(2026, 10, 12, 23, 59), at(2026, 10, 20, 0, 0)) // outside the window, future
    const cards = [reviewed('c1', at(2026, 10, 19, 7)), reviewed('c2', at(2026, 10, 19, 8)), reviewed('c3', at(2026, 10, 13, 0, 0)), card('c4', { fsrs: { ...fsrs(), last_review: undefined } })]
    const w = weeklyActivity([p1, p2], cards, now)
    const by = Object.fromEntries(w.map((d) => [d.day, [d.results, d.reviews]]))
    expect(by['2026-10-19']).toEqual([2, 2])
    expect(by['2026-10-18']).toEqual([1, 0])
    expect(by['2026-10-13']).toEqual([0, 1])
    expect(w.reduce((n, d) => n + d.results, 0)).toBe(3)
  })
  it('window spanning the fall-back change still has 7 distinct days', () => {
    const w = weeklyActivity([], [], at(2026, 10, 28, 0, 30))
    expect(new Set(w.map((d) => d.day)).size).toBe(7)
    expect(w[0].day).toBe('2026-10-22')
    const w2 = weeklyActivity([], [], at(2026, 4, 1, 23, 30))
    expect(w2.map((d) => d.day)).toContain('2026-03-29')
    expect(new Set(w2.map((d) => d.day)).size).toBe(7)
  })
  it('defaults to now', () => {
    expect(weeklyActivity([], [])[6].day).toBe(dayKey(Date.now()))
  })
})

describe('levelStats', () => {
  it('one row per syllabus level; counts add up; available ≤ total', () => {
    const topics = listTopics()
    const m = pmap(progress(topics[0].id, 10), progress(topics[1].id, 7), progress(topics[2].id, 1), progress('not-in-syllabus', 1))
    const rows = levelStats(m)
    expect(rows.map((r) => r.level)).toEqual(getSyllabus().levels.map((l) => l.level))
    for (const r of rows) {
      expect(Object.values(r.counts).reduce((a, b) => a + b, 0)).toBe(r.total)
      expect(r.available).toBeLessThanOrEqual(r.total)
    }
    const all = rows.reduce((acc, r) => ({ c: acc.c + r.counts.confident, l: acc.l + r.counts.learning, w: acc.w + r.counts.weak }), { c: 0, l: 0, w: 0 })
    expect(all).toEqual({ c: 1, l: 1, w: 1 })
  })
  it('empty progress → everything not started', () => {
    for (const r of levelStats(new Map())) expect(r.counts['not-started']).toBe(r.total)
  })
})

describe('primarySuggestion (dashboard primary step and course card — C-02)', () => {
  const topics = listTopics()
  it('a weak topic wins over unstarted ones; with no shaky topic → the next topic in course order', () => {
    expect(primarySuggestion(new Map())).toMatchObject({ topic: { id: topics[0].id }, reason: 'next' })
    const m = pmap(progress(topics[0].id, 10), progress(topics[2].id, 3))
    expect(primarySuggestion(m)).toMatchObject({ topic: { id: topics[2].id }, reason: 'weak' })
    expect(primarySuggestion(m)).toEqual(suggestTopics(m, 2)[0])
  })
})

describe('suggestTopics', () => {
  const topics = listTopics()
  it('empty progress → first topics in course order', () => {
    expect(suggestTopics(new Map()).map((s) => [s.topic.id, s.reason])).toEqual([
      [topics[0].id, 'next'],
      [topics[1].id, 'next'],
    ])
  })
  it('weakest started first, always leaving one slot for a new topic', () => {
    const m = pmap(progress(topics[0].id, 7), progress(topics[1].id, 2), progress(topics[2].id, 5), progress(topics[3].id, 10))
    const s = suggestTopics(m, 3)
    expect(s.map((x) => [x.topic.id, x.reason])).toEqual([
      [topics[1].id, 'weak'],
      [topics[2].id, 'weak'],
      [topics[4].id, 'next'],
    ])
    expect(s[0].progress).toBe(m.get(topics[1].id))
  })
  it('everything started → only shaky topics; count 0 → nothing', () => {
    const m = pmap(...topics.map((t, i) => progress(t.id, i % 2 ? 7 : 10)))
    const s = suggestTopics(m, 4)
    expect(s).toHaveLength(4)
    expect(s.every((x) => x.reason === 'learning')).toBe(true)
    expect(suggestTopics(m, 0)).toEqual([])
    expect(suggestTopics(new Map(), 0)).toEqual([])
  })
})

it('NOW fixture is a Monday noon in Lisbon (sanity for the labels above)', () => {
  expect(dayKey(NOW)).toBe('2026-10-19')
})
