/**
 * features/lessons: «Что дальше» planning (nextSteps.ts), saving runs (persist.ts: progress, error log with
 * per-tab-session dedup, SRS cards, pending «Не знаю» cards) and the in-progress run snapshot (exercises/runPersist.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTopic, listTopics, type Topic } from '@/content'
import type { TopicProgress } from '@/data/types.ts'
import { nextInOrder, planNext, recReason, unmetPrereqs, type NextPlanInput } from '@/features/lessons/nextSteps'
import { exampleCardId, exampleCardSpecs, saveRun } from '@/features/lessons/persist'
import { clearRun, loadRun, saveRunSnapshot, type RunSnapshot } from '@/features/exercises/runPersist'
import type { RunSummary } from '@/features/exercises/types'
import { card, NOW, progress } from '../fixtures/seed'
import { answer, ex, FakeRepo } from '../helpers/A-feat-fixtures'
import { installStorage, removeStorage } from '../helpers/A-feat-storage'

const pmap = (...ps: TopicProgress[]) => new Map(ps.map((p) => [p.topicId, p]))
const topics = listTopics()
const T = getTopic('a2-perfeito-vs-imperfeito')!
const [PRE1, PRE2] = T.requires

function plan(p: Partial<NextPlanInput> & { topic?: Topic } = {}) {
  return planNext({ topic: T, progress: new Map(), source: 'lesson', pct: 1, wrong: 0, retry: false, hasMiniTest: true, ...p })
}

describe('nextSteps: unmetPrereqs / nextInOrder', () => {
  it('prereqs not at least «Изучаю», weakest first (unstarted = -1 first)', () => {
    expect(T.requires.length).toBe(2)
    expect(unmetPrereqs(T, new Map()).map((r) => r.topic.id)).toEqual([PRE1, PRE2])
    const m = pmap(progress(PRE1, 5), progress(PRE2, 2))
    const r = unmetPrereqs(T, m)
    expect(r.map((x) => x.topic.id)).toEqual([PRE2, PRE1])
    expect(r[0]).toMatchObject({ reason: 'prereq', progress: m.get(PRE2) })
    expect(unmetPrereqs(T, pmap(progress(PRE1, 7), progress(PRE2, 10)))).toEqual([])
  })
  it('unknown prerequisite ids are ignored', () => {
    expect(unmetPrereqs({ ...T, requires: ['no-such-topic'] }, new Map())).toEqual([])
  })
  it('nextInOrder: topics after this one, wrapping, without confident ones and without itself', () => {
    const at = topics.findIndex((t) => t.id === T.id)
    const ids = nextInOrder(T, new Map()).map((t) => t.id)
    expect(ids[0]).toBe(topics[at + 1].id)
    expect(ids).not.toContain(T.id)
    expect(ids).toHaveLength(topics.length - 1)
    expect(ids[ids.length - 1]).toBe(topics[at - 1].id)
    const skip = nextInOrder(T, pmap(progress(topics[at + 1].id, 10))).map((t) => t.id)
    expect(skip[0]).toBe(topics[at + 2].id)
  })
  it('nextInOrder for the first / last topic and for a topic outside the list', () => {
    expect(nextInOrder(topics[0], new Map())[0].id).toBe(topics[1].id)
    expect(nextInOrder(topics[topics.length - 1], new Map())[0].id).toBe(topics[0].id)
    const ghost = { ...T, id: 'ghost' }
    expect(nextInOrder(ghost, new Map())).toHaveLength(topics.length)
  })
})

describe('nextSteps: planNext primary step', () => {
  it('low result with unmet prereqs → the weakest prerequisite', () => {
    const r = plan({ pct: 0.3, wrong: 7 })
    expect(r.primary).toMatchObject({ kind: 'topic', rec: { reason: 'prereq', topic: { id: PRE1 } } })
  })
  it('low result, prereqs fine → retry wrong answers', () => {
    const m = pmap(progress(PRE1, 9), progress(PRE2, 9))
    expect(plan({ progress: m, pct: 0.3, wrong: 7 }).primary).toEqual({ kind: 'retry-wrong' })
  })
  it('threshold: pct 0.6 is not low', () => {
    const m = pmap(progress(PRE1, 9), progress(PRE2, 9))
    expect(plan({ progress: m, pct: 0.6, wrong: 4 }).primary).toEqual({ kind: 'mini-test' })
    expect(plan({ progress: m, pct: 0.5999, wrong: 4 }).primary).toEqual({ kind: 'retry-wrong' })
  })
  it('retry run: low means any mistake left, regardless of pct', () => {
    const m = pmap(progress(PRE1, 9), progress(PRE2, 9))
    expect(plan({ progress: m, retry: true, pct: 0.9, wrong: 1 }).primary).toEqual({ kind: 'retry-wrong' })
    expect(plan({ progress: m, retry: true, pct: 0, wrong: 0 }).primary).toEqual({ kind: 'mini-test' })
  })
  it('good lesson → mini-test unless done or absent; mini-test source → next topic', () => {
    expect(plan().primary).toEqual({ kind: 'mini-test' })
    const done = pmap({ ...progress(T.id, 9), history: [{ topicId: T.id, correct: 9, total: 10, at: NOW, source: 'mini-test' }] })
    const at = topics.findIndex((t) => t.id === T.id)
    expect(plan({ progress: done }).primary).toMatchObject({ kind: 'topic', rec: { reason: 'next', topic: { id: topics[at + 1].id } } })
    expect(plan({ hasMiniTest: false }).primary).toMatchObject({ kind: 'topic' })
    expect(plan({ source: 'mini-test' }).primary).toMatchObject({ kind: 'topic' })
  })
  it('everything else confident → course', () => {
    const m = pmap(...topics.filter((t) => t.id !== T.id).map((t) => progress(t.id, 10)))
    expect(plan({ progress: m, source: 'mini-test' }).primary).toEqual({ kind: 'course' })
  })
})

describe('nextSteps: planNext recommendations', () => {
  it('at most 3, unique, never the current topic nor the primary topic', () => {
    const m = pmap(progress(PRE1, 2), progress(PRE2, 3), progress(topics[0].id, 1), progress(topics[1].id, 6))
    for (const p of [plan({ progress: m }), plan({ progress: m, pct: 0.1, wrong: 9 })]) {
      const ids = p.recs.map((r) => r.topic.id)
      expect(ids.length).toBeLessThanOrEqual(3)
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids).not.toContain(T.id)
      if (p.primary.kind === 'topic') expect(ids).not.toContain(p.primary.rec.topic.id)
    }
  })
  it('order: prereqs, next, weakest, related, later', () => {
    const r = plan()
    expect(r.recs.map((x) => x.reason)).toEqual(['prereq', 'prereq', 'next'])
    const m = pmap(progress(PRE1, 9), progress(PRE2, 9), progress(topics[0].id, 1))
    const r2 = plan({ progress: m })
    expect(r2.recs[0].reason).toBe('next')
    expect(r2.recs[1]).toMatchObject({ reason: 'weak', topic: { id: topics[0].id } })
    expect(r2.recs[2].reason).toBe('related')
    expect(r2.recs[2].topic.module).toBe(T.module)
  })
  it('nothing to recommend → empty list', () => {
    const m = pmap(...topics.map((t) => progress(t.id, 10)))
    expect(plan({ progress: m, source: 'mini-test' }).recs).toEqual([])
  })
  it('recReason texts with and without previous result', () => {
    const t = topics[0]
    const p = progress(t.id, 2, 3)
    expect(recReason({ topic: t, reason: 'prereq', progress: p })).toBe('Основа этой темы · было 67%')
    expect(recReason({ topic: t, reason: 'prereq' })).toBe('Основа этой темы')
    expect(recReason({ topic: t, reason: 'next', progress: p })).toBe('Следующая по курсу')
    expect(recReason({ topic: t, reason: 'weak', progress: p })).toBe('Стоит повторить · было 67%')
    expect(recReason({ topic: t, reason: 'related' })).toBe('Из того же раздела')
  })
})

// ─── lessons/persist.ts ─────────────────────────────────────────────────────

const LOGGED = 'ptpt:v1:logged-errors'

describe('lessons/persist: saveRun', () => {
  let session: ReturnType<typeof installStorage>
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    session = installStorage('sessionStorage')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const exercises = [ex.fillGap('e1'), ex.choice('e2'), ex.speak('e3'), ex.fillGap('e4')]
  const summary = (answers = [answer('e1', true), answer('e2', false, { given: 'é' }), answer('e3', false), answer('e4', false, { given: '', skipped: true })]): RunSummary => ({
    correct: answers.filter((a) => a.ok).length,
    total: answers.length,
    answers,
  })

  it('saves progress, logs real errors (not shadowing), adds cards, holds skipped ones as pending', async () => {
    const repo = new FakeRepo()
    const out = await saveRun(repo, { id: 'a1-ser-estar' }, summary(), exercises, { source: 'lesson', countProgress: true })
    expect(repo.results).toEqual([{ topicId: 'a1-ser-estar', correct: 1, total: 4, at: NOW, source: 'lesson' }])
    expect(out.progress).toMatchObject({ status: 'weak', lastPct: 0.25 })
    expect(repo.errors.map((e) => e.exerciseId)).toEqual(['e2', 'e4'])
    expect(repo.errors[0]).toMatchObject({ given: 'é', expected: 'right', at: NOW, topicId: 'a1-ser-estar' })
    expect(out.errorsLogged).toBe(2)
    expect(out.cardsAdded).toBe(1)
    expect([...repo.cards.keys()]).toEqual(['error:e2'])
    expect(out.pendingCards.map((c) => c.id)).toEqual(['error:e4'])
    expect(JSON.parse(session.getItem(LOGGED)!)).toEqual(['e2|é', 'e4|'])
  })
  it('retry (countProgress false) does not touch progress', async () => {
    const repo = new FakeRepo()
    const out = await saveRun(repo, { id: 't' }, summary([answer('e1', true)]), exercises, { source: 'lesson', countProgress: false })
    expect(out).toEqual({ progress: undefined, errorsLogged: 0, cardsAdded: 0, pendingCards: [] })
    expect(repo.results).toEqual([])
    expect(repo.upserts).toEqual([])
  })
  it('the same mistake (exercise + given) is logged once per tab session; a different given is logged', async () => {
    const repo = new FakeRepo()
    const s = summary([answer('e2', false, { given: 'é' })])
    await saveRun(repo, { id: 't' }, s, exercises, { source: 'lesson', countProgress: true })
    const again = await saveRun(repo, { id: 't' }, s, exercises, { source: 'lesson', countProgress: false })
    expect(again.errorsLogged).toBe(0)
    await saveRun(repo, { id: 't' }, summary([answer('e2', false, { given: 'era' })]), exercises, { source: 'lesson', countProgress: false })
    expect(repo.errors.map((e) => e.given)).toEqual(['é', 'era'])
  })
  it('duplicates inside one run are logged once', async () => {
    const repo = new FakeRepo()
    const out = await saveRun(repo, { id: 't' }, summary([answer('e2', false, { given: 'x' }), answer('e2', false, { given: 'x' })]), exercises, { source: 'lesson', countProgress: false })
    expect(out.errorsLogged).toBe(1)
  })
  it('existing error cards keep their state (no duplicate upsert)', async () => {
    const repo = new FakeRepo()
    const old = card('error:e2', { exerciseId: 'e2' })
    repo.cards.set(old.id, old)
    const out = await saveRun(repo, { id: 't' }, summary([answer('e2', false)]), exercises, { source: 'lesson', countProgress: false })
    expect(out.errorsLogged).toBe(1)
    expect(out.cardsAdded).toBe(0)
    expect(repo.upserts).toEqual([])
    expect(repo.cards.get('error:e2')).toBe(old)
  })
  it('answers of exercises not in the list are still logged', async () => {
    const repo = new FakeRepo()
    const out = await saveRun(repo, { id: 't' }, summary([answer('zz', false)]), [], { source: 'situation', countProgress: false })
    expect(out.errorsLogged).toBe(1)
  })
  it('the dedup list is capped at 500 keys (oldest dropped)', async () => {
    session.setItem(LOGGED, JSON.stringify(Array.from({ length: 500 }, (_, i) => `old${i}|x`)))
    const repo = new FakeRepo()
    await saveRun(repo, { id: 't' }, summary([answer('e2', false, { given: 'novo' })]), exercises, { source: 'lesson', countProgress: false })
    const keys = JSON.parse(session.getItem(LOGGED)!) as string[]
    expect(keys).toHaveLength(500)
    expect(keys[0]).toBe('old1|x')
    expect(keys[499]).toBe('e2|novo')
  })
  it.each([
    ['malformed JSON', '{oops'],
    ['an object', '{"a":1}'],
    ['null', 'null'],
  ])('storage holding %s is treated as empty', async (_, raw) => {
    session.setItem(LOGGED, raw)
    const repo = new FakeRepo()
    const out = await saveRun(repo, { id: 't' }, summary([answer('e2', false)]), exercises, { source: 'lesson', countProgress: false })
    expect(out.errorsLogged).toBe(1)
  })
  it('quota errors and a missing sessionStorage do not break saving (no dedup then)', async () => {
    session.failSet = true
    const repo = new FakeRepo()
    expect((await saveRun(repo, { id: 't' }, summary([answer('e2', false)]), exercises, { source: 'lesson', countProgress: false })).errorsLogged).toBe(1)
    removeStorage('sessionStorage')
    expect((await saveRun(repo, { id: 't' }, summary([answer('e2', false)]), exercises, { source: 'lesson', countProgress: true })).errorsLogged).toBe(1)
  })
})

describe('lessons/persist: example cards', () => {
  it('ids ex:<topic>:<i>, front ru, back pt, grammar kind', () => {
    expect(exampleCardId('t', 3)).toBe('ex:t:3')
    const specs = exampleCardSpecs(T)
    expect(specs).toHaveLength(T.examples.length)
    expect(specs[0]).toEqual({ id: `ex:${T.id}:0`, kind: 'grammar', front: T.examples[0].ru, back: T.examples[0].pt, topicId: T.id })
  })
})

// ─── exercises/runPersist.ts ────────────────────────────────────────────────

describe('exercises/runPersist', () => {
  let session: ReturnType<typeof installStorage>
  beforeEach(() => {
    session = installStorage('sessionStorage')
  })
  afterEach(() => vi.unstubAllGlobals())

  const ids = ['a', 'b', 'c']
  const snap = (p: Partial<RunSnapshot> = {}): RunSnapshot => ({ ids, index: 1, answers: [answer('a', true)], current: null, ...p })

  it('round-trips a snapshot for the same exercise list', () => {
    saveRunSnapshot('lesson:t', snap())
    expect(session.dump()).toHaveProperty(['ptpt:v1:run:lesson:t'])
    expect(loadRun('lesson:t', ids)).toEqual(snap())
  })
  it('index 0 is restored only with an answered current exercise', () => {
    saveRunSnapshot('k', snap({ index: 0, answers: [], current: null }))
    expect(loadRun('k', ids)).toBeNull()
    saveRunSnapshot('k', snap({ index: 0, answers: [], current: answer('a', false) }))
    expect(loadRun('k', ids)?.current?.exerciseId).toBe('a')
  })
  it('different / reordered / shorter list, or index past the end → null', () => {
    saveRunSnapshot('k', snap())
    expect(loadRun('k', ['a', 'c', 'b'])).toBeNull()
    expect(loadRun('k', ['a', 'b'])).toBeNull()
    expect(loadRun('k', ['a', 'b', 'c', 'd'])).toBeNull()
    saveRunSnapshot('k', snap({ index: 3 }))
    expect(loadRun('k', ids)).toBeNull()
  })
  it('no key → no-op / null; nothing stored → null', () => {
    saveRunSnapshot(undefined, snap())
    expect(session.length).toBe(0)
    expect(loadRun(undefined, ids)).toBeNull()
    expect(loadRun('', ids)).toBeNull()
    expect(loadRun('missing', ids)).toBeNull()
    clearRun(undefined)
  })
  it('malformed JSON or wrong shape → null', () => {
    session.setItem('ptpt:v1:run:k', '{bad')
    expect(loadRun('k', ids)).toBeNull()
    session.setItem('ptpt:v1:run:k', '{"index":1}')
    expect(loadRun('k', ids)).toBeNull()
  })
  it('clearRun removes the snapshot', () => {
    saveRunSnapshot('k', snap())
    clearRun('k')
    expect(loadRun('k', ids)).toBeNull()
  })
  it('quota / blocked / missing storage never throws', () => {
    session.failSet = true
    expect(() => saveRunSnapshot('k', snap())).not.toThrow()
    session.failAll = true
    expect(loadRun('k', ids)).toBeNull()
    expect(() => clearRun('k')).not.toThrow()
    removeStorage('sessionStorage')
    expect(loadRun('k', ids)).toBeNull()
    expect(() => saveRunSnapshot('k', snap())).not.toThrow()
    expect(() => clearRun('k')).not.toThrow()
  })
})
