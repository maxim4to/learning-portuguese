/**
 * src/features/words/{learn,draft,wordReview}.ts — «Учить новые» candidates and batch size, editor draft validation
 * and patches, typed-answer rules of dictionary cards.
 */
import { describe, expect, test } from 'vitest'
import type { SrsCard, WordEntry, WordStatus } from '@/data/types.ts'
import { DAY, NOW, fsrs, fsrsNew, word, wordCard } from '../fixtures/seed.ts'
import { LEARN_BATCH, learnCandidates, learnCount } from '@/features/words/learn'
import { draftOf, patchOf, validateDraft, type WordDraft } from '@/features/words/draft'
import { isTypedWordCard, suggestWordRating } from '@/features/words/wordReview'
import { groupCardsByWord, wordStatuses } from '@/features/words/status'

const newCard = (w: WordEntry, mode: SrsCard['mode'] = 'recognize', patch: Partial<SrsCard> = {}) => wordCard(w, mode, { fsrs: fsrsNew(), ...patch })

function setup(words: WordEntry[], cards: SrsCard[]) {
  return learnCandidates(words, groupCardsByWord(cards), wordStatuses(words, cards))
}

describe('learnCandidates', () => {
  test('only «new» words with an active, never-reviewed recognize card', () => {
    const a = word('a', 'а')
    const known = word('k', 'к', { mark: 'known' })
    const learning = word('l', 'л')
    const suspended = word('s', 'с')
    const noCard = word('n', 'н')
    const onlyProduce = word('p', 'п')
    const cards = [
      newCard(a),
      newCard(known),
      wordCard(learning, 'recognize', { fsrs: fsrs({ state: 1, learning_steps: 1 }) }),
      newCard(suspended, 'recognize', { suspended: true }),
      newCard(onlyProduce, 'produce'),
    ]
    const ids = setup([a, known, learning, suspended, noCard, onlyProduce], cards).map((x) => x.entry.id)
    expect(ids).toEqual(['u:a'])
  })

  test('a word whose status is «new» but has a mark is skipped even if statuses disagree', () => {
    const w = word('x', 'x', { mark: 'known' })
    const statuses = new Map<string, WordStatus>([[w.id, 'new']])
    expect(learnCandidates([w], groupCardsByWord([newCard(w)]), statuses)).toEqual([])
  })

  test('recognize card in state 0 but with another word id is not used', () => {
    const w = word('x', 'x')
    const foreign = { ...newCard(w), id: 'lex:u:other:recognize' }
    const statuses = new Map<string, WordStatus>([[w.id, 'new']])
    expect(learnCandidates([w], new Map([[w.id, [foreign]]]), statuses)).toEqual([])
  })

  test('order: met most recently first (sources or createdAt), then words with an example sentence', () => {
    const old = word('old', 'x', { createdAt: NOW - 10 * DAY, sources: [{ src: 'manual', form: 'old', at: NOW - 10 * DAY }] })
    const metAgain = word('again', 'x', {
      createdAt: NOW - 20 * DAY,
      sources: [
        { src: 'manual', form: 'again', at: NOW - 20 * DAY },
        { src: 'vocab:t', form: 'again', at: NOW - DAY },
      ],
    })
    const tieNoSentence = word('tie1', 'x', { createdAt: NOW - 5 * DAY, sources: [{ src: 'manual', form: 'tie1', at: NOW - 5 * DAY }] })
    const tieSentence = word('tie2', 'x', {
      createdAt: NOW - 5 * DAY,
      sources: [{ src: 'manual', form: 'tie2', at: NOW - 5 * DAY, sentence: 'Uma frase com tie2.' }],
    })
    const tieBlank = word('tie3', 'x', { createdAt: NOW - 5 * DAY, sources: [{ src: 'manual', form: 'tie3', at: NOW - 5 * DAY, sentence: '   ' }] })
    const noSources = word('nosrc', 'x', { createdAt: NOW - 2 * DAY, sources: [] })
    const words = [old, tieNoSentence, tieBlank, tieSentence, metAgain, noSources]
    const ids = setup(words, words.map((w) => newCard(w))).map((x) => x.entry.lemma)
    expect(ids).toEqual(['again', 'nosrc', 'tie2', 'tie1', 'tie3', 'old'])
  })

  test('empty input', () => {
    expect(learnCandidates([], new Map(), new Map())).toEqual([])
  })

  test('large dictionary stays linear-ish and sorted', () => {
    const words = Array.from({ length: 3000 }, (_, i) => word(`w${i}`, 'x', { createdAt: NOW - i * 1000, sources: [] }))
    const out = setup(words, words.map((w) => newCard(w)))
    expect(out).toHaveLength(3000)
    expect(out[0].entry.lemma).toBe('w0')
    expect(out.at(-1)!.entry.lemma).toBe('w2999')
  })
})

describe('learnCount', () => {
  test.each([
    [10, 20, 0, LEARN_BATCH],
    [3, 20, 0, 3],
    [10, 20, 18, 2],
    [10, 20, 20, 0],
    [10, 20, 25, 0],
    [0, 20, 0, 0],
    [10, 0, 0, 0],
    [-1, 20, 0, 0],
  ])('candidates %i, limit %i, seen %i → %i', (c, limit, seen, n) => expect(learnCount(c, limit, seen)).toBe(n))
})

describe('draft', () => {
  const w = word('saúde', 'здоровье', { pos: 'noun', gender: 'f', note: 'n', modes: ['recognize', 'produce'] })

  test('draftOf: empty strings for missing optionals; modes copied', () => {
    const d = draftOf(word('x', 'y'))
    expect(d).toEqual({ lemma: 'x', ru: 'y', pos: '', gender: '', note: '', modes: ['recognize'] })
    const d2 = draftOf(w)
    d2.modes.push('cloze')
    expect(w.modes).toEqual(['recognize', 'produce'])
  })

  test('validateDraft: required, trimmed lengths, modes only when asked', () => {
    const ok: WordDraft = draftOf(w)
    expect(validateDraft(ok)).toEqual({})
    expect(validateDraft({ ...ok, lemma: '   ', ru: '\t' })).toEqual({ lemma: 'Введите слово на португальском', ru: 'Введите перевод' })
    expect(validateDraft({ ...ok, lemma: 'a'.repeat(120) })).toEqual({})
    expect(validateDraft({ ...ok, lemma: ` ${'a'.repeat(120)} ` })).toEqual({})
    expect(validateDraft({ ...ok, lemma: 'a'.repeat(121) }).lemma).toBe('Не длиннее 120 символов')
    expect(validateDraft({ ...ok, ru: 'я'.repeat(500) })).toEqual({})
    expect(validateDraft({ ...ok, ru: 'я'.repeat(501) }).ru).toBe('Не длиннее 500 символов')
    expect(validateDraft({ ...ok, modes: [] })).toEqual({})
    expect(validateDraft({ ...ok, modes: [] }, { modes: true }).modes).toBe('Оставьте хотя бы один вид карточек')
    expect(validateDraft(ok, { modes: true })).toEqual({})
  })

  test('patchOf: unchanged draft → empty patch', () => {
    expect(patchOf(w, draftOf(w))).toEqual({})
    expect(patchOf(w, { ...draftOf(w), lemma: '  saúde ', ru: 'здоровье  ', note: ' n ' })).toEqual({})
  })

  test('patchOf: changed fields only; blanks clear optionals', () => {
    const d = { ...draftOf(w), lemma: ' a saúde ', pos: '' as const, gender: 'm' as const, note: '  ', modes: ['recognize' as const] }
    expect(patchOf(w, d)).toEqual({ lemma: 'a saúde', pos: undefined, gender: 'm', note: undefined, modes: ['recognize'] })
    const p = patchOf(w, { ...draftOf(w), ru: 'здоровье; самочувствие' })
    expect(p).toEqual({ ru: 'здоровье; самочувствие' })
  })

  test('patchOf: modes order change counts as a change', () => {
    expect(patchOf(w, { ...draftOf(w), modes: ['produce', 'recognize'] })).toEqual({ modes: ['produce', 'recognize'] })
  })

  test('patchOf: adding pos/gender/note to an entry without them', () => {
    const bare = word('x', 'y')
    expect(patchOf(bare, { ...draftOf(bare), pos: 'verb', note: 'reflexivo' })).toEqual({ pos: 'verb', note: 'reflexivo' })
  })
})

describe('wordReview', () => {
  const w = word('x', 'y')
  test('isTypedWordCard: dictionary non-recognize cards while typing is on (default on)', () => {
    expect(isTypedWordCard(undefined, null)).toBe(false)
    expect(isTypedWordCard(wordCard(w, 'recognize'), null)).toBe(false)
    expect(isTypedWordCard(wordCard(w, 'produce'), null)).toBe(true)
    expect(isTypedWordCard(wordCard(w, 'cloze'), {})).toBe(true)
    expect(isTypedWordCard(wordCard(w, 'listen'), { typeWordAnswers: true })).toBe(true)
    expect(isTypedWordCard(wordCard(w, 'listen'), { typeWordAnswers: false })).toBe(false)
    expect(isTypedWordCard({ ...wordCard(w, 'produce'), wordId: undefined }, null)).toBe(false)
    expect(isTypedWordCard({ ...wordCard(w, 'produce'), mode: undefined }, null)).toBe(false)
  })

  test('suggestWordRating', () => {
    expect(suggestWordRating({ verdict: 'correct', skipped: false, ok: true })).toBe('good')
    expect(suggestWordRating({ verdict: 'wrong', skipped: false, ok: false })).toBe('again')
    expect(suggestWordRating({ verdict: 'correct', skipped: true, ok: false })).toBe('again')
    expect(suggestWordRating({ verdict: 'accents', skipped: false, ok: false })).toBe('hard')
    expect(suggestWordRating({ verdict: 'accents', skipped: false, ok: true })).toBe('good')
  })
})
