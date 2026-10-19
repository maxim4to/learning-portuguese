/** Topic progress (src/data/types.ts): statusFromPct thresholds, applyResult, history cap, parseExportBundle on garbage. */
import { describe, expect, it } from 'vitest'
import { applyResult, DEFAULT_SETTINGS, parseExportBundle, statusFromPct, WORD_SOURCES_MAX, type ExportBundle, type TopicResult } from '@/data/types.ts'
import { NOW } from '../fixtures/seed'

const r = (correct: number, total: number, at = NOW, p: Partial<TopicResult> = {}): TopicResult => ({ topicId: 't', correct, total, at, source: 'lesson', ...p })

describe('statusFromPct', () => {
  it.each([
    [undefined, 'not-started'],
    [0, 'weak'],
    [0.5999, 'weak'],
    [0.6, 'learning'],
    [0.8499, 'learning'],
    [0.85, 'confident'],
    [1, 'confident'],
    [1.5, 'confident'],
    [-1, 'weak'],
  ] as const)('%s → %s', (pct, s) => {
    expect(statusFromPct(pct)).toBe(s)
  })
  it('thresholds hit exactly with real fractions (6/10, 17/20)', () => {
    expect(statusFromPct(6 / 10)).toBe('learning')
    expect(statusFromPct(17 / 20)).toBe('confident')
    expect(statusFromPct(3 / 5)).toBe('learning')
  })
})

describe('applyResult', () => {
  it('first result creates progress', () => {
    expect(applyResult(undefined, r(7, 10))).toEqual({
      topicId: 't',
      status: 'learning',
      attempts: 1,
      lastPct: 0.7,
      bestPct: 0.7,
      lastAt: NOW,
      history: [r(7, 10)],
    })
  })
  it('later results: attempts++, last vs best, status follows the LAST result', () => {
    const p1 = applyResult(undefined, r(10, 10, NOW))
    const p2 = applyResult(p1, r(2, 10, NOW + 1))
    expect(p2).toMatchObject({ attempts: 2, lastPct: 0.2, bestPct: 1, status: 'weak', lastAt: NOW + 1 })
    expect(p2.history).toHaveLength(2)
    expect(p1.history).toHaveLength(1) // not mutated
  })
  it('total 0 → pct 0 (weak), no NaN', () => {
    const p = applyResult(undefined, r(0, 0))
    expect(p.lastPct).toBe(0)
    expect(p.status).toBe('weak')
  })
  it('history keeps the newest 20 (newest last)', () => {
    let p = applyResult(undefined, r(1, 1, 0))
    for (let i = 1; i < 25; i++) p = applyResult(p, r(1, 1, i))
    expect(p.history).toHaveLength(20)
    expect(p.history[0].at).toBe(5)
    expect(p.history[19].at).toBe(24)
    expect(p.attempts).toBe(25)
  })
  it('keeps source / mode / note on the stored result', () => {
    const p = applyResult(undefined, r(1, 1, NOW, { source: 'tutor', mode: 'daily', note: 'n' }))
    expect(p.history[0]).toMatchObject({ source: 'tutor', mode: 'daily', note: 'n' })
  })
  it('legacy progress without bestPct/attempts', () => {
    const legacy = { topicId: 't', status: 'weak', lastPct: 0.1, lastAt: 1, history: [] } as never
    expect(applyResult(legacy, r(5, 10))).toMatchObject({ attempts: 1, bestPct: 0.5 })
  })
})

describe('parseExportBundle', () => {
  const good: ExportBundle = { app: 'portugues-pt', version: 1, exportedAt: NOW, progress: [], cards: [], errors: [], settings: DEFAULT_SETTINGS }

  it('accepts an object or its JSON; words default to []', () => {
    expect(parseExportBundle(good)).toEqual({ ...good, words: [], skipped: 0 })
    expect(parseExportBundle(JSON.stringify(good))).toEqual({ ...good, words: [], skipped: 0 })
  })
  it.each([
    ['not JSON', '{oops', SyntaxError],
    ['JSON null', 'null', /ожидался JSON-объект/],
    ['JSON number', '42', /ожидался JSON-объект/],
    ['JSON string', '"x"', /ожидался JSON-объект/],
    ['empty object', '{}', /не экспорт/],
    ['other app', JSON.stringify({ ...good, app: 'other' }), /не экспорт/],
    ['version 2', JSON.stringify({ ...good, version: 2 }), /не экспорт/],
    ['version "1"', JSON.stringify({ ...good, version: '1' }), /не экспорт/],
    ['array', '[]', /не экспорт/],
  ])('rejects %s', (_, input, err) => {
    expect(() => parseExportBundle(input)).toThrow(err as RegExp)
  })
  it('missing / wrong-typed collections become empty; settings merged over defaults; bad exportedAt → now', () => {
    const b = parseExportBundle({ app: 'portugues-pt', version: 1, progress: 'x', cards: {}, errors: null, settings: { rate: 1.25 }, exportedAt: 'soon' } as never)
    expect(b.progress).toEqual([])
    expect(b.cards).toEqual([])
    expect(b.errors).toEqual([])
    expect(b.settings).toEqual({ ...DEFAULT_SETTINGS, rate: 1.25 })
    expect(b.exportedAt).toBeGreaterThan(0)
    expect(parseExportBundle({ app: 'portugues-pt', version: 1, settings: null } as never).settings).toEqual(DEFAULT_SETTINGS)
  })
  it('words: invalid entries dropped, defaults filled, sources capped', () => {
    const sources = Array.from({ length: 8 }, (_, i) => ({ src: 'manual', form: `f${i}`, at: i }))
    const b = parseExportBundle({
      ...good,
      words: [null, 1, 'x', { id: '', lemma: 'a', ru: 'b' }, { id: 'w1', lemma: 'casa' }, { id: 'w2', lemma: 'casa', ru: 'дом', sources, modes: [], createdAt: 'x' }, { id: 'w3', lemma: 'pão', ru: 'хлеб', createdAt: 5 }],
    } as never)
    expect(b.words.map((w) => w.id)).toEqual(['w2', 'w3'])
    expect(b.words[0].sources).toHaveLength(WORD_SOURCES_MAX)
    expect(b.words[0].sources[0].form).toBe('f3')
    expect(b.words[0].modes).toEqual(['recognize'])
    expect(b.words[0].createdAt).toBeGreaterThan(0)
    expect(b.words[1]).toMatchObject({ sources: [], createdAt: 5, updatedAt: 5 })
  })
  // BUG A-09: see docs/testing-bugs/A.md — progress / cards / errors items are not validated at all.
  it('progress / cards / errors entries that are not objects with an id are rejected or dropped', () => {
    const b = parseExportBundle({ ...good, progress: [null, 42, {}], cards: [null, {}], errors: ['x'] } as never)
    expect(b.progress).toEqual([])
    expect(b.cards).toEqual([])
    expect(b.errors).toEqual([])
  })
  // BUG A-09 (same root cause): non-object settings are spread character by character.
  it('non-object settings fall back to defaults', () => {
    expect(parseExportBundle({ ...good, settings: 'abc' } as never).settings).toEqual(DEFAULT_SETTINGS)
  })
})
