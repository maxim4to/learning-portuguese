/**
 * src/features/words/lexicon.ts — article stripping, content word → lexicon entry, save inputs, useLexicon().
 * The lexicon is the real generated bundle; `useLexicon` runs on the fake hook runtime (tests/helpers/A-words-env.ts).
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Lexicon } from '@/engine/lexicon/lookup'

const lexMock = vi.hoisted(() => ({
  loaded: null as Lexicon | null,
  load: null as null | (() => Promise<Lexicon>),
}))

vi.mock('react', async (orig) => ({ ...(await orig<object>()), ...(await import('../helpers/A-words-env.ts')).fakeReact }))
vi.mock('@/engine/lexicon/lookup', async (orig) => ({
  ...(await orig<object>()),
  getLoadedLexicon: () => lexMock.loaded,
  loadLexicon: () => lexMock.load!(),
}))

const { flush, loadTestLexicon, renderHook } = await import('../helpers/A-words-env.ts')
const { GENDER_LABEL, POS_LABEL, POS_SHORT_LABEL, bareLemma, contentWordInput, lexEntryInput, matchContentWord, useLexicon } = await import(
  '@/features/words/lexicon'
)
const { listVocabThemes } = await import('@/content')

const lex = loadTestLexicon()

describe('labels', () => {
  test('every part of speech has a full label; short labels exist (other = empty)', () => {
    for (const k of Object.keys(POS_LABEL) as (keyof typeof POS_LABEL)[]) {
      expect(POS_LABEL[k]).toBeTruthy()
      expect(k in POS_SHORT_LABEL).toBe(true)
    }
    expect(POS_SHORT_LABEL.other).toBe('')
    expect(Object.keys(GENDER_LABEL)).toEqual(['m', 'f', 'mf'])
  })
})

describe('bareLemma', () => {
  test.each([
    ['a saúde', 'saúde'],
    ['o/a utente', 'utente'],
    ['a/o utente', 'utente'],
    ['os/as alunos', 'alunos'],
    ['O currículo (CV)', 'currículo'],
    ['os óculos', 'óculos'],
    ['As férias', 'férias'],
    ['um carro', 'carro'],
    ['uma casa', 'casa'],
    ['  a   casa  ', 'casa'],
    ['casa (f) (pl.)', 'casa'],
    ['a', 'a'],
    ['o', 'o'],
    ['ovo', 'ovo'],
    ['amigo', 'amigo'],
    ['levantar-se', 'levantar-se'],
    ['', ''],
  ])('%j → %j', (pt, bare) => expect(bareLemma(pt)).toBe(bare))
})

describe('contentWordInput without the lexicon (chunk failed to load)', () => {
  const opts = { themeKey: 'vocab:x', src: 'vocab:x', level: 'A1' as const }

  test('article gives noun + gender; lemma is bare; source keeps the example', () => {
    expect(contentWordInput(null, { pt: 'a saúde', ru: 'здоровье', example: 'A saúde é importante.' }, opts)).toEqual({
      lexId: undefined,
      lemma: 'saúde',
      ru: 'здоровье',
      pos: 'noun',
      gender: 'f',
      level: 'A1',
      source: { src: 'vocab:x', form: 'saúde', sentence: 'A saúde é importante.' },
    })
  })

  test.each([
    ['o pão', 'm'],
    ['os óculos', 'm'],
    ['as férias', 'f'],
    ['uma casa', 'f'],
    ['um carro', 'm'],
    ['o/a utente', 'mf'],
    ['A/O colega', 'mf'],
    ['O Pão', 'm'],
  ])('%s → gender %s', (pt, gender) => {
    const r = contentWordInput(null, { pt, ru: 'x' }, opts)
    expect(r.pos).toBe('noun')
    expect(r.gender).toBe(gender)
  })

  test('explicit gender wins over the article; gender alone makes a noun', () => {
    expect(contentWordInput(null, { pt: 'o artista', ru: 'x', gender: 'mf' }, opts).gender).toBe('mf')
    expect(contentWordInput(null, { pt: 'colega', ru: 'x', gender: 'mf' }, opts)).toMatchObject({ pos: 'noun', gender: 'mf', lemma: 'colega' })
  })

  test('no article, no gender: pos and gender unknown', () => {
    const r = contentWordInput(null, { pt: 'levantar-se', ru: 'вставать' }, opts)
    expect(r.pos).toBeUndefined()
    expect(r.gender).toBeUndefined()
    expect(r.lemma).toBe('levantar-se')
    expect(r.level).toBe('A1')
  })

  // A-19 (fixed): a content phrase that starts with the preposition «a» («a pé», «a partir de») is not taken for
  // «article + noun».
  // Real content: «a pé» — «пешком» (vocab/transportes-e-cidade.json).
  test('prepositional «a …» phrases are not turned into feminine nouns', () => {
    for (const pt of ['a pé', 'a partir de', 'a cavalo', 'a sério']) {
      const r = contentWordInput(null, { pt, ru: 'x' }, opts)
      expect(r.lemma).toBe(pt)
      expect(r.pos).not.toBe('noun')
      expect(r.gender).toBeUndefined()
    }
    // a real feminine noun keeps its article handling
    expect(contentWordInput(null, { pt: 'a saúde', ru: 'x' }, opts)).toMatchObject({ lemma: 'saúde', pos: 'noun', gender: 'f' })
    expect(contentWordInput(null, { pt: 'a colher', ru: 'x' }, opts)).toMatchObject({ lemma: 'colher', pos: 'noun', gender: 'f' })
  })
})

describe('contentWordInput / matchContentWord with the lexicon', () => {
  const themes = listVocabThemes()

  test('theme words resolve to a lexicon entry of that theme (sampled across all themes)', () => {
    let checked = 0
    let matched = 0
    for (const t of themes) {
      for (const w of t.words.slice(0, 3)) {
        const key = `vocab:${t.id}`
        const e = matchContentWord(lex, w, key)
        checked++
        if (e) {
          matched++
          const input = contentWordInput(lex, w, { themeKey: key, src: key })
          expect(input.lexId).toBe(e.id)
          expect(input.lemma).toBe(e.lemma)
          expect(input.ru).toBe(w.ru)
          expect(input.source?.form).toBe(e.lemma)
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
    // the lexicon is built from the content: practically every theme word is in it
    expect(matched / checked).toBeGreaterThan(0.9)
  })

  test('the content gender wins over the lexicon gender; content level is a fallback only', () => {
    const t = themes.find((x) => x.words.some((w) => w.gender))!
    const w = t.words.find((x) => x.gender)!
    const key = `vocab:${t.id}`
    const input = contentWordInput(lex, { ...w, gender: w.gender === 'm' ? 'f' : 'm' }, { themeKey: key, src: key, level: 'C1' as never })
    expect(input.gender).toBe(w.gender === 'm' ? 'f' : 'm')
    const e = matchContentWord(lex, w, key)
    if (e?.level) expect(input.level).toBe(e.level)
  })

  test('a word of another theme falls back to an exact hit by lemma; unknown words → undefined', () => {
    const t = themes[0]
    const w = t.words[0]
    const e = matchContentWord(lex, w, 'vocab:__no_theme__')
    expect(e === undefined || e.lemma.length > 0).toBe(true)
    expect(matchContentWord(lex, { pt: 'xyzzyqwerty', ru: 'x' }, `vocab:${t.id}`)).toBeUndefined()
    const input = contentWordInput(lex, { pt: 'o xyzzyqwerty', ru: 'x' }, { themeKey: `vocab:${t.id}`, src: 's' })
    expect(input).toMatchObject({ lexId: undefined, lemma: 'xyzzyqwerty', pos: 'noun', gender: 'm' })
  })

  // A-19 (fixed, via the lexicon): «a pé» is saved as the expression, not as pé#noun (which is «o pé», нога).
  test('«a pé» from transportes-e-cidade is not saved as the feminine noun «pé»', () => {
    const w = listVocabThemes().find((t) => t.id === 'transportes-e-cidade')!.words.find((x) => x.pt === 'a pé')!
    const r = contentWordInput(lex, w, { themeKey: 'vocab:transportes-e-cidade', src: 'vocab:transportes-e-cidade' })
    expect(r).toMatchObject({ lexId: 'a pé#adv', lemma: 'a pé', pos: 'adv' })
    expect(r.gender).toBeUndefined()
  })

  test('lexEntryInput: all meanings unless a translation is given, manual source', () => {
    const e = lex.search('casa', 1)[0]
    expect(e).toBeDefined()
    expect(lexEntryInput(e)).toEqual({ lexId: e.id, lemma: e.lemma, ru: e.ru, pos: e.pos, gender: e.gender, level: e.level, source: { src: 'manual', form: e.lemma } })
    expect(lexEntryInput(e, 'дом').ru).toBe('дом')
  })
})

describe('useLexicon', () => {
  beforeEach(() => {
    lexMock.loaded = null
    lexMock.load = null
  })

  test('already loaded: ready at once, no load', () => {
    lexMock.loaded = lex
    lexMock.load = vi.fn()
    const h = renderHook(() => useLexicon())
    expect(h.result).toEqual({ lex, status: 'ready' })
    expect(lexMock.load).not.toHaveBeenCalled()
  })

  test('loading → ready', async () => {
    lexMock.load = () => Promise.resolve(lex)
    const h = renderHook(() => useLexicon())
    expect(h.result).toEqual({ lex: null, status: 'loading' })
    await flush()
    expect(h.result).toEqual({ lex, status: 'ready' })
  })

  test('loading → error when the chunk fails', async () => {
    lexMock.load = () => Promise.reject(new Error('chunk'))
    const h = renderHook(() => useLexicon())
    await flush()
    expect(h.result).toEqual({ lex: null, status: 'error' })
  })

  test('unmounted before the load finishes: no state update', async () => {
    let resolve!: (l: Lexicon) => void
    lexMock.load = () => new Promise((r) => (resolve = r))
    const h = renderHook(() => useLexicon())
    h.unmount()
    const renders = h.renders
    resolve(lex)
    await flush()
    expect(h.renders).toBe(renders)
    expect(h.result.status).toBe('loading')
  })

  test('unmounted before a failure: no state update', async () => {
    let reject!: (e: Error) => void
    lexMock.load = () => new Promise((_, r) => (reject = r))
    const h = renderHook(() => useLexicon())
    h.unmount()
    reject(new Error('x'))
    await flush()
    expect(h.result.status).toBe('loading')
  })
})
