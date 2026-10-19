/**
 * src/features/words/wordOps.ts — branches not covered by scripts/words.test.ts: id normalisation (NFC/NFD,
 * typographic apostrophes and hyphens), faces/hints, write algebra, planners on edge inputs and malformed state,
 * staged unlock contexts, legacy cleanup through a repository.
 */
import { describe, expect, test, vi } from 'vitest'
import { WORD_CARD_MODES, WORD_SOURCES_MAX, type ProgressRepository, type SrsCard, type WordBundleWrite, type WordEntry } from '@/data/types.ts'
import { NOW, card, fsrs, fsrsNew, word, wordCard } from '../fixtures/seed.ts'
import {
  applyWrite,
  buildCards,
  cardFaces,
  commitWrite,
  deleteLegacyWordCards,
  exampleSource,
  invertWrite,
  isEmptyWrite,
  isLegacyWordCard,
  legacyWordCards,
  normalizeLemma,
  parseWordCardId,
  planAddSource,
  planApplyEnabledModes,
  planCardReviewed,
  planDeleteWords,
  planLegacyCleanup,
  planMarkKnown,
  planSaveWords,
  planUnlockNext,
  planUnmarkKnown,
  planUpdateWord,
  refreshCardFaces,
  shouldSuspend,
  wordCardId,
  wordHint,
  wordIdFor,
  wordPt,
  type WordsState,
} from '@/features/words/wordOps'
import { GAP } from '@/features/words/cloze'

const empty: WordsState = { words: [], cards: [] }
const all4 = ['recognize', 'produce', 'cloze', 'listen'] as const

/** A word saved through the planner (realistic entry + recognize card). */
function saved(lemma: string, extra: Partial<Parameters<typeof planSaveWords>[1][number]> = {}, now = NOW): WordsState {
  const p = planSaveWords(empty, [{ lemma, ru: 'ru', ...extra }], { now })
  return applyWrite(empty, p.write)
}

describe('normalizeLemma / wordIdFor', () => {
  test.each([
    ['Saúde', 'saúde'],
    ['saúde', 'saúde'], // NFD → NFC
    ['  levantar‑se  ', 'levantar-se'], // U+2011 non-breaking hyphen
    ['levantar‐se', 'levantar-se'], // U+2010
    ['levantar–se', 'levantar-se'], // en dash
    ['copo d’água', "copo d'água"],
    ['copo dʼágua', "copo d'água"],
    ['copo d‘água', "copo d'água"],
    ['casa\tde\n banho', 'casa de banho'],
    ['ÁGUA', 'água'],
    ['CORAÇÃO', 'coração'],
    ['', ''],
  ])('%j → %j', (input, out) => expect(normalizeLemma(input)).toBe(out))

  test('NFC and NFD spellings of a word share one id; lexId wins', () => {
    expect(wordIdFor({ lemma: 'pão' })).toBe(wordIdFor({ lemma: 'pão' }))
    expect(wordIdFor({ lemma: 'Pão ' })).toBe('u:pão')
    expect(wordIdFor({ lexId: 'pão#noun', lemma: 'whatever' })).toBe('pão#noun')
    expect(wordIdFor({ lexId: '', lemma: 'pão' })).toBe('u:pão')
  })
})

describe('parseWordCardId', () => {
  test('round trip incl. ids with colons and unicode', () => {
    for (const id of ['saúde#noun', 'u:pão de forma', "u:copo d'água", 'u:a:b'])
      for (const m of all4) expect(parseWordCardId(wordCardId(id, m))).toEqual({ wordId: id, mode: m })
  })
  test.each(['', 'lex:', 'lex::recognize', 'lex:x:bogus', 'lex:x', 'w:x:recognize', 'error:lex:x:recognize', 'LEX:x:recognize'])('%j → undefined', (id) =>
    expect(parseWordCardId(id)).toBeUndefined(),
  )
})

describe('faces and hints', () => {
  test('wordPt: article only for nouns with a gender and no article yet', () => {
    expect(wordPt({ lemma: 'saúde', pos: 'noun', gender: 'f' })).toBe('a saúde')
    expect(wordPt({ lemma: 'utente', pos: 'noun', gender: 'mf' })).toBe('o/a utente')
    expect(wordPt({ lemma: 'pão', gender: 'm' })).toBe('o pão') // pos unknown + gender → noun
    expect(wordPt({ lemma: 'pão', pos: 'adj', gender: 'm' })).toBe('pão')
    expect(wordPt({ lemma: 'pão', pos: 'noun' })).toBe('pão')
    expect(wordPt({ lemma: 'Os óculos', pos: 'noun', gender: 'm' })).toBe('Os óculos')
    expect(wordPt({ lemma: 'o/a colega', pos: 'noun', gender: 'mf' })).toBe('o/a colega')
    expect(wordPt({ lemma: 'ovo', pos: 'noun', gender: 'm' })).toBe('o ovo') // «o» prefix of the lemma is not an article
  })

  test('wordHint', () => {
    expect(wordHint({})).toBe('')
    expect(wordHint({ pos: 'noun', gender: 'f' })).toBe('сущ., ж. р.')
    expect(wordHint({ gender: 'mf' })).toBe('м./ж. р.')
    expect(wordHint({ pos: 'verb' })).toBe('гл.')
    expect(wordHint({ pos: 'other' })).toBe('')
  })

  test('exampleSource: newest source with a non-blank sentence', () => {
    const at = NOW
    expect(exampleSource({ sources: [] })).toBeUndefined()
    expect(exampleSource({ sources: [{ src: 'a', form: 'x', at, sentence: '  ' }] })).toBeUndefined()
    const s1 = { src: 'a', form: 'x', at, sentence: 'Frase 1.' }
    const s2 = { src: 'b', form: 'x', at, sentence: 'Frase 2.' }
    expect(exampleSource({ sources: [s1, s2, { src: 'c', form: 'x', at }] })).toBe(s2)
  })

  test('cardFaces: produce without a hint; cloze without a sentence shows the gap', () => {
    const w = word('correr', 'бегать', { pos: undefined, sources: [] })
    expect(cardFaces(w, 'produce')).toEqual({ front: 'бегать', back: 'correr' })
    expect(cardFaces(w, 'cloze')).toEqual({ front: GAP, back: 'correr' })
    const v = word('correr', 'бегать', { pos: 'verb', sources: [{ src: 'm', form: 'corro', at: NOW, sentence: 'Eu corro todos os dias.' }] })
    expect(cardFaces(v, 'produce').front).toBe('бегать (гл.)')
    expect(cardFaces(v, 'cloze')).toEqual({ front: `Eu ${GAP} todos os dias.`, back: 'Eu corro todos os dias.' })
    expect(cardFaces(v, 'listen')).toEqual({ front: 'correr', back: 'correr — бегать' })
  })

  test('buildCards: repeated modes give one card; default `now` is Date.now()', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    try {
      const w = word('x', 'y')
      const cards = buildCards(w, ['recognize', 'recognize', 'produce'])
      expect(cards.map((c) => c.id)).toEqual(['lex:u:x:recognize', 'lex:u:x:produce'])
      expect(cards[0].createdAt).toBe(NOW)
      expect(cards.every((c) => c.kind === 'word' && c.wordId === 'u:x')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  test('refreshCardFaces: only own dictionary cards whose faces changed', () => {
    const w = word('x', 'y')
    const own = wordCard(w, 'recognize', { front: 'x', back: 'old' })
    const fine = wordCard(w, 'produce', { ...cardFaces(w, 'produce') })
    const other = wordCard(word('z', 'z'), 'recognize', { front: '?', back: '?' })
    const modeless = { ...card('lex:u:x:recognize'), wordId: 'u:x', mode: undefined }
    const out = refreshCardFaces(w, [own, fine, other, modeless], NOW + 1)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: own.id, front: 'x', back: 'y', updatedAt: NOW + 1, fsrs: own.fsrs })
  })
})

describe('write algebra', () => {
  test('isEmptyWrite', () => {
    expect(isEmptyWrite({})).toBe(true)
    expect(isEmptyWrite({ words: [], cards: [], deleteWordIds: [], deleteCardIds: [] })).toBe(true)
    expect(isEmptyWrite({ deleteCardIds: ['x'] })).toBe(false)
  })

  test('applyWrite: sets then deletes (a delete of a just-set id wins); input untouched', () => {
    const w = word('x', 'y')
    const state: WordsState = { words: [w], cards: [] }
    const c = wordCard(w)
    const next = applyWrite(state, { words: [{ ...w, ru: 'z' }], cards: [c], deleteCardIds: [c.id] })
    expect(next.words[0].ru).toBe('z')
    expect(next.cards).toEqual([])
    expect(state.words[0].ru).toBe('y')
    expect(applyWrite(state, { deleteWordIds: ['u:x', 'u:missing'] }).words).toEqual([])
  })

  test('invertWrite restores updated, deleted and created docs (apply ∘ invert = identity)', () => {
    const a = word('a', 'a')
    const b = word('b', 'b')
    const ca = wordCard(a)
    const state: WordsState = { words: [a, b], cards: [ca] }
    const write: WordBundleWrite = {
      words: [{ ...a, ru: 'changed' }, word('new', 'n')],
      cards: [{ ...ca, suspended: true }, wordCard(b)],
      deleteWordIds: ['u:b'],
      deleteCardIds: ['lex:u:nothing:produce'],
    }
    const after = applyWrite(state, write)
    const restored = applyWrite(after, invertWrite(state, write))
    const sort = <T extends { id: string }>(xs: readonly T[]) => [...xs].sort((x, y) => x.id.localeCompare(y.id))
    expect(sort(restored.words)).toEqual(sort(state.words))
    expect(sort(restored.cards)).toEqual(sort(state.cards))
  })

  test('commitWrite: empty writes never reach the repository', async () => {
    const saveWordBundle = vi.fn(async () => {})
    const repo = { saveWordBundle } as unknown as ProgressRepository
    await commitWrite(repo, {})
    await commitWrite(repo, { words: [] })
    expect(saveWordBundle).not.toHaveBeenCalled()
    await commitWrite(repo, { deleteWordIds: ['x'] })
    expect(saveWordBundle).toHaveBeenCalledWith({ deleteWordIds: ['x'] })
  })
})

describe('planSaveWords', () => {
  test('NFC and NFD inputs in one call merge into one entry (two sources, one card)', () => {
    const p = planSaveWords(
      empty,
      [
        { lemma: 'pão', ru: 'хлеб', source: { src: 'vocab:a', form: 'pão' } },
        { lemma: 'pão', ru: 'батон', source: { src: 'vocab:b', form: 'pão' } },
      ],
      { now: NOW },
    )
    expect(p.words).toHaveLength(1)
    expect(p.words[0].id).toBe('u:pão')
    expect(p.words[0].ru).toBe('хлеб')
    expect(p.words[0].sources.map((s) => s.src)).toEqual(['vocab:a', 'vocab:b'])
    expect(p.write.cards).toHaveLength(1)
  })

  test('meanings: list or «;»-string, blanks dropped, trimmed', () => {
    const p = planSaveWords(empty, [{ lemma: 'a', ru: ['  um ', '', 'dois'] }, { lemma: 'b', ru: ' x ;; ; y ;' }], { now: NOW })
    expect(p.words.map((w) => w.ru)).toEqual(['um; dois', 'x; y'])
  })

  test('new entry: trimmed lemma/note, copied tags/modes, source.at defaults to now, long sentence capped at 300', () => {
    const tags = ['t1']
    const modes: ('recognize' | 'produce')[] = ['recognize', 'produce']
    const p = planSaveWords(
      empty,
      [{ lemma: '  correr ', ru: 'бегать', note: '  ', tags, modes, level: 'A1', source: { src: 'manual', form: 'corro', sentence: 'x'.repeat(400) } }],
      { now: NOW },
    )
    const w = p.words[0]
    expect(w.lemma).toBe('correr')
    expect(w).not.toHaveProperty('note')
    expect(w.tags).toEqual(['t1'])
    expect(w.tags).not.toBe(tags)
    expect(w.modes).toEqual(['recognize', 'produce'])
    expect(w.modes).not.toBe(modes)
    expect(w.sources[0].at).toBe(NOW)
    expect(w.sources[0].sentence).toHaveLength(300)
    expect(w.level).toBe('A1')
    expect(Object.values(w).includes(undefined)).toBe(false)
  })

  test('new entry with empty modes/tags lists → all modes, no tags', () => {
    const w = planSaveWords(empty, [{ lemma: 'x', ru: 'y', modes: [], tags: [] }], { now: NOW }).words[0]
    expect(w.modes).toEqual([...WORD_CARD_MODES])
    expect(w).not.toHaveProperty('tags')
  })

  test('merge: fills missing fields, keeps own ones, unions tags, empty own ru is filled', () => {
    const prev = word('casa', '', { tags: ['a'], note: 'mine', sources: [] })
    const p = planSaveWords({ words: [prev], cards: [] }, [{ lemma: 'casa', ru: 'дом', lexId: undefined, pos: 'noun', gender: 'f', level: 'A1', note: 'theirs', tags: ['a', 'b'] }], { now: NOW })
    expect(p.words[0]).toMatchObject({ ru: 'дом', pos: 'noun', gender: 'f', level: 'A1', note: 'mine', tags: ['a', 'b'], createdAt: prev.createdAt, updatedAt: NOW })
    const keep = planSaveWords({ words: [word('casa', 'дом', { pos: 'verb', tags: ['a'] })], cards: [] }, [{ lemma: 'casa', ru: 'жилище', pos: 'noun' }], { now: NOW })
    expect(keep.words[0]).toMatchObject({ ru: 'дом', pos: 'verb', tags: ['a'] })
  })

  test('merge: re-saving a known word keeps the mark and creates no cards; existing word without cards gets recognize', () => {
    const known = word('k', 'k', { mark: 'known', modes: [...WORD_CARD_MODES] })
    const p = planSaveWords({ words: [known], cards: [] }, [{ lemma: 'k', ru: 'k' }], { now: NOW })
    expect(p.words[0].mark).toBe('known')
    expect(p.write.cards).toEqual([])
    const lost = word('l', 'l', { modes: [...WORD_CARD_MODES] })
    expect(planSaveWords({ words: [lost], cards: [] }, [{ lemma: 'l', ru: 'l' }], { now: NOW }).write.cards?.map((c) => c.id)).toEqual(['lex:u:l:recognize'])
  })

  test('re-saving the same source moves it to the end instead of duplicating; cap WORD_SOURCES_MAX', () => {
    let s = saved('x', { source: { src: 's0', form: 'x', at: NOW } })
    for (let i = 1; i <= 7; i++) s = applyWrite(s, planSaveWords(s, [{ lemma: 'x', ru: 'r', source: { src: `s${i}`, form: 'x', at: NOW + i } }], { now: NOW + i }).write)
    s = applyWrite(s, planSaveWords(s, [{ lemma: 'x', ru: 'r', source: { src: 's4', form: 'x', at: NOW + 99 } }], { now: NOW + 99 }).write)
    const srcs = s.words[0].sources.map((x) => x.src)
    expect(srcs).toHaveLength(WORD_SOURCES_MAX)
    expect(srcs).toEqual(['s3', 's5', 's6', 's7', 's4'])
  })

  test('words without recognize in entry modes or settings get no card; empty input is an empty plan', () => {
    expect(planSaveWords(empty, [{ lemma: 'x', ru: 'y', modes: ['produce'] }], { now: NOW }).write.cards).toEqual([])
    expect(planSaveWords(empty, [{ lemma: 'x', ru: 'y' }], { now: NOW, enabledModes: ['produce', 'cloze'] }).write.cards).toEqual([])
    expect(planSaveWords(empty, [], { now: NOW })).toEqual({ words: [], write: { words: [], cards: [] } })
  })

  test('a big import (500 words) is one plan with one card per word', () => {
    const inputs = Array.from({ length: 500 }, (_, i) => ({ lemma: `palavra${i}`, ru: `слово${i}` }))
    const p = planSaveWords(empty, inputs, { now: NOW })
    expect(p.words).toHaveLength(500)
    expect(p.write.cards).toHaveLength(500)
    expect(new Set(p.write.cards!.map((c) => c.id)).size).toBe(500)
  })
})

describe('planUpdateWord', () => {
  const base = () => {
    const w = word('saúde', 'здоровье', { pos: 'noun', gender: 'f', note: 'n', tags: ['t'], level: 'A1', modes: [...WORD_CARD_MODES] })
    const cards = (['recognize', 'produce', 'listen'] as const).map((m) => wordCard(w, m))
    return { w, state: { words: [w], cards } as WordsState }
  }

  test('unknown id → empty plan', () => {
    expect(planUpdateWord(empty, 'u:x', { ru: 'y' }, NOW)).toEqual({ words: [], write: {} })
  })

  test('blank lemma keeps the old one; ru list joined; empty modes → recognize; duplicate modes collapsed', () => {
    const { state, w } = base()
    const p = planUpdateWord(state, w.id, { lemma: '   ', ru: ['a', ' b '] as unknown as string, modes: [] }, NOW)
    expect(p.words[0]).toMatchObject({ lemma: 'saúde', ru: 'a; b', modes: ['recognize'], id: w.id, updatedAt: NOW })
    expect(planUpdateWord(state, w.id, { modes: ['produce', 'produce', 'recognize'] }, NOW).words[0].modes).toEqual(['produce', 'recognize'])
  })

  test('explicit undefined clears optional fields; absent keys are kept', () => {
    const { state, w } = base()
    const p = planUpdateWord(state, w.id, { pos: undefined, gender: undefined, note: undefined, tags: undefined, level: undefined }, NOW)
    for (const k of ['pos', 'gender', 'note', 'tags', 'level']) expect(p.words[0]).not.toHaveProperty(k)
    expect(planUpdateWord(state, w.id, { ru: 'x' }, NOW).words[0]).toMatchObject({ pos: 'noun', gender: 'f', note: 'n' })
  })

  test('the id never changes with the lemma; faces of all cards refresh', () => {
    const { state, w } = base()
    const p = planUpdateWord(state, w.id, { lemma: 'doença', gender: 'f' }, NOW)
    expect(p.words[0].id).toBe(w.id)
    expect(p.write.cards!.find((c) => c.mode === 'recognize')!.front).toBe('a doença')
  })

  test('removing a mode in settings-disabled state keeps the card suspended when re-added', () => {
    const { state, w } = base()
    const off = applyWrite(state, planUpdateWord(state, w.id, { modes: ['recognize', 'produce'] }, NOW).write)
    expect(off.cards.find((c) => c.mode === 'listen')!.suspended).toBe(true)
    const back = planUpdateWord(off, w.id, { modes: [...WORD_CARD_MODES] }, NOW, ['recognize', 'produce', 'cloze'])
    expect(back.write.cards!.find((c) => c.mode === 'listen')).toBeUndefined()
    const on = applyWrite(off, planUpdateWord(off, w.id, { modes: [...WORD_CARD_MODES] }, NOW).write)
    expect(on.cards.find((c) => c.mode === 'listen')).not.toHaveProperty('suspended')
  })

  test('a known word: re-enabling modes keeps its cards suspended', () => {
    const { state, w } = base()
    const known = applyWrite(state, planMarkKnown(state, w.id, NOW).write)
    const p = planUpdateWord(known, w.id, { modes: ['recognize'] }, NOW)
    expect(applyWrite(known, p.write).cards.every((c) => c.suspended)).toBe(true)
  })

  test('mode-less cards of the word are ignored', () => {
    const { state, w } = base()
    const odd = { ...card('lex:odd'), wordId: w.id, front: 'a saúde', back: 'здоровье' }
    const p = planUpdateWord({ ...state, cards: [...state.cards, odd] }, w.id, { modes: ['recognize'] }, NOW)
    expect(p.write.cards!.some((c) => c.id === 'lex:odd')).toBe(false)
  })

  // BUG A-20: see docs/testing-bugs/A.md — editing the word's modes resumes a card the learner paused by hand
  // (CardList «Приостановить») in a mode that was not touched by the edit.
  test.fails('changing one mode leaves a hand-paused card of another mode paused', () => {
    const { state, w } = base()
    const paused = applyWrite(state, { cards: [{ ...state.cards.find((c) => c.mode === 'produce')!, suspended: true }] })
    const p = planUpdateWord(paused, w.id, { modes: ['recognize', 'produce', 'cloze'] }, NOW) // listen switched off
    const after = applyWrite(paused, p.write)
    expect(after.cards.find((c) => c.mode === 'listen')!.suspended).toBe(true)
    expect(after.cards.find((c) => c.mode === 'produce')!.suspended).toBe(true)
  })
})

describe('planAddSource / planDeleteWords / planMarkKnown / planUnmarkKnown', () => {
  test('missing ids → empty plans', () => {
    expect(planAddSource(empty, 'u:x', { src: 's', form: 'x', at: NOW })).toEqual({ words: [], write: {} })
    expect(planMarkKnown(empty, 'u:x')).toEqual({ words: [], write: {} })
    expect(planUnmarkKnown(empty, 'u:x')).toEqual({ words: [], write: {} })
  })

  test('addSource refreshes the cloze face to the newest sentence', () => {
    const w = word('casa', 'дом', { sources: [{ src: 'a', form: 'casa', at: NOW, sentence: 'A casa é grande.' }], modes: [...WORD_CARD_MODES] })
    const [cz] = buildCards(w, ['cloze'], [], NOW)
    const p = planAddSource({ words: [w], cards: [cz] }, w.id, { src: 'b', form: 'casa', at: NOW + 1, sentence: 'Vivo numa casa.' }, NOW + 1)
    expect(p.words[0].sources).toHaveLength(2)
    expect(p.write.cards).toEqual([expect.objectContaining({ id: cz.id, front: `Vivo numa ${GAP}.`, back: 'Vivo numa casa.' })])
    // a sentence without the form changes nothing on the card
    const q = planAddSource({ words: [w], cards: [cz] }, w.id, { src: 'c', form: 'lar', at: NOW + 1, sentence: 'Nada.' }, NOW + 1)
    expect(q.write.cards).toEqual([])
  })

  test('delete: duplicate ids collapse; all deterministic card ids even without cached cards', () => {
    const p = planDeleteWords(empty, ['u:x', 'u:x'])
    expect(p.write.deleteWordIds).toEqual(['u:x'])
    expect(p.write.deleteCardIds).toEqual(WORD_CARD_MODES.map((m) => `lex:u:x:${m}`))
    const odd = { ...card('legacy-id'), wordId: 'u:x' }
    expect(planDeleteWords({ words: [], cards: [odd] }, ['u:x']).write.deleteCardIds).toContain('legacy-id')
    expect(planDeleteWords(empty, []).write).toEqual({ deleteWordIds: [], deleteCardIds: [] })
  })

  test('markKnown: only not-yet-suspended cards are written; other words untouched', () => {
    const w = word('x', 'y', { modes: [...WORD_CARD_MODES] })
    const o = word('o', 'o')
    const cards = [wordCard(w, 'recognize'), wordCard(w, 'produce', { suspended: true }), wordCard(o)]
    const p = planMarkKnown({ words: [w, o], cards }, w.id, NOW)
    expect(p.words[0].mark).toBe('known')
    expect(p.write.cards!.map((c) => c.id)).toEqual(['lex:u:x:recognize'])
  })

  test('unmarkKnown: modes disabled in settings or for the word stay suspended', () => {
    const w = word('x', 'y', { mark: 'known', modes: ['recognize', 'produce'] })
    const cards = (['recognize', 'produce', 'listen'] as const).map((m) => wordCard(w, m, { suspended: true }))
    const p = planUnmarkKnown({ words: [w], cards }, w.id, { now: NOW, enabledModes: ['recognize', 'listen'] })
    expect(p.words[0]).not.toHaveProperty('mark')
    expect(p.write.cards!.map((c) => c.id)).toEqual(['lex:u:x:recognize'])
    expect(p.write.cards![0]).not.toHaveProperty('suspended')
  })

  test('unmarkKnown without cards: recognize only if allowed', () => {
    const w = word('x', 'y', { mark: 'known', modes: ['produce'] })
    expect(planUnmarkKnown({ words: [w], cards: [] }, w.id, { now: NOW }).write.cards).toEqual([])
  })
})

describe('staged unlock contexts', () => {
  const reviewRecognize = (w: WordEntry, stability: number) => wordCard(w, 'recognize', { fsrs: fsrs({ state: 2, stability }) })

  test('unknown word → empty plan; nothing ready → empty write', () => {
    expect(planUnlockNext(empty, 'u:x')).toEqual({ words: [], write: {} })
    const w = word('x', 'y', { modes: [...WORD_CARD_MODES] })
    expect(planUnlockNext({ words: [w], cards: [wordCard(w, 'recognize', { fsrs: fsrsNew() })] }, w.id, { now: NOW }).write).toEqual({})
  })

  test('canListen as a per-word function', () => {
    const w = word('x', 'y', { modes: ['recognize', 'listen'] })
    const state = { words: [w], cards: [reviewRecognize(w, 10)] }
    const fn = vi.fn((e: WordEntry) => e.id !== 'u:x')
    expect(planUnlockNext(state, w.id, { now: NOW, canListen: fn }).write).toEqual({})
    expect(fn).toHaveBeenCalledWith(w)
    expect(planUnlockNext(state, w.id, { now: NOW, canListen: () => true }).write.cards?.map((c) => c.mode)).toEqual(['listen'])
  })

  test('planCardReviewed: a recognize card of a missing word unlocks nothing', () => {
    const w = word('x', 'y')
    expect(planCardReviewed(empty, wordCard(w, 'recognize'), 'good', { now: NOW })).toEqual({ words: [], write: {} })
  })

  test('shouldSuspend', () => {
    const w = word('x', 'y', { modes: ['recognize'] })
    expect(shouldSuspend(undefined, 'recognize', [])).toBe(false)
    expect(shouldSuspend(w, 'recognize', ['recognize'])).toBe(false)
    expect(shouldSuspend(w, 'produce', ['produce'])).toBe(true)
    expect(shouldSuspend(w, 'recognize', [])).toBe(true)
    expect(shouldSuspend({ ...w, mark: 'known' }, 'recognize', ['recognize'])).toBe(true)
  })

  test('planApplyEnabledModes: only changed modes are touched; per-word canListen; non-dictionary cards ignored', () => {
    const w = word('x', 'y', { modes: [...WORD_CARD_MODES] })
    const recognize = reviewRecognize(w, 10)
    const produce = wordCard(w, 'produce', { suspended: true }) // paused by hand
    const listen = wordCard(w, 'listen')
    const foreign = card('ph:s:1')
    const state = { words: [w], cards: [recognize, produce, listen, foreign] }
    const off = planApplyEnabledModes(state, ['recognize', 'produce', 'cloze'], ['listen'], { now: NOW })
    expect(off.write.cards!.map((c) => [c.id, c.suspended])).toEqual([['lex:u:x:listen', true]])
    const noop = planApplyEnabledModes(state, [...WORD_CARD_MODES], ['cloze'], { now: NOW, canListen: () => false })
    expect(noop.write).toEqual({})
  })

  test('planApplyEnabledModes: an active card of a deleted word (orphan) is left as is, nothing created for it', () => {
    const w = word('gone', 'x')
    const orphan = wordCard(w, 'listen')
    const p = planApplyEnabledModes({ words: [], cards: [orphan] }, [...WORD_CARD_MODES], undefined, { now: NOW })
    expect(p.write).toEqual({})
  })
})

describe('legacy cleanup', () => {
  test('selection: w:* and g:* without wordId; everything else kept', () => {
    const cards: SrsCard[] = [
      card('w:theme:1', { kind: 'word' }),
      card('g:reading:2', { kind: 'word' }),
      card('w:x:1', { kind: 'word', wordId: 'u:x' }),
      card('ph:s:1', { kind: 'phrase' }),
      card('lex:u:x:recognize', { kind: 'word', wordId: 'u:x', mode: 'recognize' }),
      card('error:e1'),
      card('wx', { kind: 'word' }),
      card('gramma:1', { kind: 'grammar' }),
    ]
    expect(legacyWordCards(cards).map((c) => c.id)).toEqual(['w:theme:1', 'g:reading:2'])
    expect(isLegacyWordCard(card('w:'))).toBe(true)
    expect(planLegacyCleanup([])).toEqual({ deleteCardIds: [] })
  })

  test('deleteLegacyWordCards: reads all cards, deletes legacy ones, returns the count', async () => {
    const saveWordBundle = vi.fn(async () => {})
    const repo = { getCards: async () => [card('w:a:1'), card('g:b:2'), card('ph:c:3')], saveWordBundle } as unknown as ProgressRepository
    expect(await deleteLegacyWordCards(repo)).toBe(2)
    expect(saveWordBundle).toHaveBeenCalledWith({ deleteCardIds: ['w:a:1', 'g:b:2'] })
    const none = { getCards: async () => [card('ph:c:3')], saveWordBundle: vi.fn() } as unknown as ProgressRepository
    expect(await deleteLegacyWordCards(none)).toBe(0)
    expect(none.saveWordBundle).not.toHaveBeenCalled()
  })
})

