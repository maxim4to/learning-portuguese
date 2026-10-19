/** features/diagnostic: stages and shuffling, per-topic outcomes, route, history reconstruction, saving. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDiagnostic, getTopic, LEVELS, type DiagnosticQuestion } from '@/content'
import type { TopicProgress, TopicResult } from '@/data/types.ts'
import {
  buildStages,
  countGrades,
  formatDate,
  GRADE_META,
  gradeOf,
  lastResultFromHistory,
  outcomesFromAnswers,
  recommendedRoute,
  skippedLevelsFor,
  spreadShuffle,
  STOP_THRESHOLD,
  syllabusTopicIds,
  topicTitle,
  type TopicOutcome,
} from '@/features/diagnostic/plan'
import { saveDiagnostic } from '@/features/diagnostic/persist'
import { NOW, progress } from '../fixtures/seed'
import { answer, FakeRepo } from '../helpers/A-feat-fixtures'

const q = (id: string, topicId: string, level: DiagnosticQuestion['level'] = 'A1', type: 'fill-gap' | 'speak-shadow' = 'fill-gap'): DiagnosticQuestion =>
  type === 'fill-gap'
    ? { id, topicId, level, type, prompt: '___', answer: ['x'] }
    : { id, topicId, level, type, text: 'Olá' }

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const adjacent = (qs: readonly DiagnosticQuestion[]) => qs.some((x, i) => i > 0 && qs[i - 1].topicId === x.topicId)
const sameItems = (a: readonly DiagnosticQuestion[], b: readonly DiagnosticQuestion[]) => expect([...a].map((x) => x.id).sort()).toEqual([...b].map((x) => x.id).sort())

describe('diagnostic: spreadShuffle / buildStages', () => {
  it('keeps every question and avoids same-topic neighbours (real diagnostic, many seeds)', () => {
    const all = getDiagnostic().questions
    for (let s = 1; s <= 30; s++) {
      for (const st of buildStages(all, rng(s))) {
        expect(adjacent(st.questions), `seed ${s} ${st.level}`).toBe(false)
        expect(st.questions.every((x) => x.level === st.level)).toBe(true)
      }
    }
    const stages = buildStages(all, rng(1))
    expect(stages.map((s) => s.level)).toEqual(LEVELS.filter((l) => all.some((x) => x.level === l)))
    expect(stages.reduce((n, s) => n + s.questions.length, 0)).toBe(all.length)
  })
  it('levels without questions are dropped; empty input → no stages', () => {
    expect(buildStages([q('1', 'a', 'B1')], rng(1)).map((s) => s.level)).toEqual(['B1'])
    expect(buildStages([], rng(1))).toEqual([])
  })
  it('impossible spread (all one topic) still returns every question', () => {
    const qs = [q('1', 'a'), q('2', 'a'), q('3', 'a')]
    sameItems(spreadShuffle(qs, rng(3)), qs)
  })
  it('greedy repair kicks in when the random attempts keep clashing (no-swap random source)', () => {
    const qs = [q('1', 'a'), q('2', 'a'), q('3', 'b')]
    const out = spreadShuffle(qs, () => 0.999)
    sameItems(out, qs)
    expect(out.map((x) => x.topicId)).toEqual(['a', 'b', 'a'])
  })
  // A-15 (fixed): the repair finds a spread whenever one exists.
  it('greedy repair finds the spread when one exists (a a a b b → a b a b a)', () => {
    const qs = [q('1', 'a'), q('2', 'a'), q('3', 'a'), q('4', 'b'), q('5', 'b')]
    const out = spreadShuffle(qs, () => 0.999)
    sameItems(out, qs)
    expect(adjacent(out)).toBe(false)
    expect(out.map((x) => x.topicId)).toEqual(['a', 'b', 'a', 'b', 'a'])
  })
  it('repair spreads three topics with a dominant one (4 a, 2 b, 1 c) and keeps every question once', () => {
    const qs = [q('1', 'a'), q('2', 'a'), q('3', 'a'), q('4', 'a'), q('5', 'b'), q('6', 'b'), q('7', 'c')]
    for (const r of [() => 0.999, () => 0]) {
      const out = spreadShuffle(qs, r)
      sameItems(out, qs)
      expect(adjacent(out)).toBe(false)
    }
  })
  it('defaults to Math.random', () => {
    const qs = [q('1', 'a'), q('2', 'b'), q('3', 'c')]
    sameItems(spreadShuffle(qs), qs)
    expect(buildStages(qs)).toHaveLength(1)
  })
})

describe('diagnostic: outcomes and grades', () => {
  it('outcomesFromAnswers counts per topic', () => {
    const m = outcomesFromAnswers([
      answer('1', true, { topicId: 'a' }),
      answer('2', false, { topicId: 'a' }),
      answer('3', true, { topicId: 'b' }),
    ])
    expect(m).toEqual(new Map([['a', { correct: 1, total: 2 }], ['b', { correct: 1, total: 1 }]]))
    expect(outcomesFromAnswers([])).toEqual(new Map())
  })
  it('gradeOf: none / green / red / yellow', () => {
    expect(gradeOf(undefined)).toBe('none')
    expect(gradeOf({ correct: 0, total: 0 })).toBe('none')
    expect(gradeOf({ correct: 2, total: 2 })).toBe('green')
    expect(gradeOf({ correct: 0, total: 2 })).toBe('red')
    expect(gradeOf({ correct: 1, total: 2 })).toBe('yellow')
    for (const g of ['green', 'yellow', 'red', 'none'] as const) expect(GRADE_META[g].label).toBeTruthy()
    expect(STOP_THRESHOLD).toBe(0.4)
  })
  it('countGrades ignores unassessed topics', () => {
    const m = new Map<string, TopicOutcome>([['a', { correct: 1, total: 1 }], ['b', { correct: 0, total: 1 }], ['c', { correct: 1, total: 2 }], ['d', { correct: 0, total: 0 }]])
    expect(countGrades(m)).toEqual({ green: 1, yellow: 1, red: 1 })
    expect(countGrades(new Map())).toEqual({ green: 0, yellow: 0, red: 0 })
  })
  it('recommendedRoute: red first then yellow, each in syllabus order; unknown topics last; green skipped', () => {
    const order = syllabusTopicIds()
    expect(order.length).toBeGreaterThan(10)
    const [t1, t2, t3, t4] = [order[5], order[1], order[3], order[0]]
    const m = new Map<string, TopicOutcome>([
      [t1, { correct: 0, total: 2 }],
      [t2, { correct: 1, total: 2 }],
      [t3, { correct: 0, total: 1 }],
      [t4, { correct: 1, total: 1 }],
      ['zz-not-in-syllabus', { correct: 0, total: 1 }],
    ])
    expect(recommendedRoute(m)).toEqual([
      { id: t3, grade: 'red' },
      { id: t1, grade: 'red' },
      { id: 'zz-not-in-syllabus', grade: 'red' },
      { id: t2, grade: 'yellow' },
    ])
    // Does not mutate the syllabus order between calls.
    expect(syllabusTopicIds()).not.toContain('zz-not-in-syllabus')
  })
  it('skippedLevelsFor: levels with questions but no assessed topic', () => {
    const qs = [q('1', 'a', 'A1'), q('2', 'b', 'A2'), q('3', 'c', 'B1')]
    expect(skippedLevelsFor(qs, new Map([['a', { correct: 1, total: 1 }]]))).toEqual(['A2', 'B1'])
    expect(skippedLevelsFor([], new Map())).toEqual([])
  })
})

describe('diagnostic: lastResultFromHistory', () => {
  const r = (topicId: string, at: number, source: TopicResult['source'] = 'diagnostic', correct = 1): TopicResult => ({ topicId, correct, total: 2, at, source })
  const p = (topicId: string, history: TopicResult[]): TopicProgress => ({ ...progress(topicId, 1, 2), history })
  const qs = [q('1', 'a', 'A1'), q('2', 'b', 'A2')]

  it('no lastAt / no matching entries → undefined', () => {
    expect(lastResultFromHistory(undefined, [p('a', [r('a', NOW)])], qs)).toBeUndefined()
    expect(lastResultFromHistory(0, [p('a', [r('a', 0)])], qs)).toBeUndefined()
    expect(lastResultFromHistory(NOW, [p('a', [r('a', NOW, 'lesson')])], qs)).toBeUndefined()
    expect(lastResultFromHistory(NOW, [p('a', [r('a', NOW - 60_000)])], qs)).toBeUndefined()
  })
  it('takes the newest diagnostic entry within ±60 s; older runs are ignored', () => {
    const res = lastResultFromHistory(NOW, [p('a', [r('a', NOW - 5 * 86_400_000, 'diagnostic', 0), r('a', NOW - 59_999, 'diagnostic', 0), r('a', NOW + 10, 'diagnostic', 2)])], qs)
    expect(res).toEqual({ at: NOW, topics: new Map([['a', { correct: 2, total: 2 }]]), skippedLevels: ['A2'] })
  })
})

describe('diagnostic: titles and dates', () => {
  it('topicTitle: real topic title, otherwise humanised id', () => {
    expect(topicTitle('a1-ser-estar')).toBe(getTopic('a1-ser-estar')!.title)
    expect(topicTitle('a2-preterito-xyz-abc')).toBe('preterito xyz abc')
    expect(topicTitle('c1-foo-bar')).toBe('c1 foo bar')
  })
  it('formatDate: Russian long date with time', () => {
    expect(formatDate(new Date(2026, 9, 19, 14, 5).getTime())).toMatch(/19 октября 2026.*14:05/)
  })
})

describe('diagnostic/persist: saveDiagnostic', () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }))
  afterEach(() => vi.useRealTimers())

  it('one result per topic, errors without shadowing, lastDiagnosticAt', async () => {
    const repo = new FakeRepo()
    const qs = [q('1', 'a'), q('2', 'a'), q('3', 'b'), q('4', 'b', 'A1', 'speak-shadow')]
    const answers = [
      answer('1', true, { topicId: 'a' }),
      answer('2', false, { topicId: 'a', given: 'g2' }),
      answer('3', false, { topicId: 'b' }),
      answer('4', false, { topicId: 'b' }),
    ]
    const out = await saveDiagnostic(repo, answers, qs, NOW)
    expect(out).toEqual({ topicsSaved: 2, errorsLogged: 2 })
    expect(repo.results).toEqual([
      { topicId: 'a', correct: 1, total: 2, at: NOW, source: 'diagnostic' },
      { topicId: 'b', correct: 0, total: 2, at: NOW, source: 'diagnostic' },
    ])
    expect(repo.errors.map((e) => [e.exerciseId, e.given, e.at])).toEqual([
      ['2', 'g2', NOW],
      ['3', 'wrong', NOW],
    ])
    expect(repo.settings.lastDiagnosticAt).toBe(NOW)
    // Round trip: the saved history rebuilds the same result.
    const rebuilt = lastResultFromHistory(NOW, await repo.getAllProgress(), qs)
    expect(rebuilt?.topics).toEqual(outcomesFromAnswers(answers))
  })
  it('no answers → nothing saved except the timestamp', async () => {
    const repo = new FakeRepo()
    expect(await saveDiagnostic(repo, [], [], NOW)).toEqual({ topicsSaved: 0, errorsLogged: 0 })
    expect(repo.settings.lastDiagnosticAt).toBe(NOW)
  })
})
