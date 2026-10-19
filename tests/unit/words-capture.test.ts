/**
 * src/features/words/capture/{savedMatch,text,options}.ts — branch gaps: saved-word highlighting with ambiguous
 * forms, phrases and Cyrillic, the Intl.Segmenter-less fallback, caret/offset edges, long-sentence windows,
 * scope rules, and the order of lookup options. A small fake Lexicon drives the branches precisely; the real one
 * checks a few realistic cases.
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { LexCandidate, LexEntry, Lexicon, MweMatch } from '@/engine/lexicon/lookup'
import type { WordStatus } from '@/data/types.ts'
import { tokenize } from '@/engine/lexicon/normalize'
import { word } from '../fixtures/seed.ts'
import { loadTestLexicon } from '../helpers/A-words-env.ts'
import { LETTER, MARKED, buildSavedMatcher, savedSpans } from '@/features/words/capture/savedMatch'
import {
  SENTENCE_MAX,
  interactiveAncestor,
  lookupModeOf,
  selectionLookupText,
  sentenceAt,
  tokenIndexAt,
  wordAt,
  wordsOf,
  type ElementLike,
} from '@/features/words/capture/text'
import { lookupOptions } from '@/features/words/capture/options'

// ─── Fake lexicon ────────────────────────────────────────────────────────────

const entry = (id: string): LexEntry => ({ index: 0, id, lemma: id.split('#')[0], pos: 'noun', ru: ['x'], themes: [] }) as unknown as LexEntry
const cand = (id: string, approximate = false): LexCandidate => ({ entry: entry(id), form: id, matched: id, tag: '', via: 'form', approximate }) as unknown as LexCandidate

interface FakeLex extends Lexicon {
  resolveCalls: number
}

function fakeLex(
  table: Record<string, (ctx?: { prev?: string; next?: string }) => LexCandidate[]>,
  mwe: (tokens: readonly string[], i: number) => MweMatch | null = () => null,
): FakeLex {
  const lex = {
    resolveCalls: 0,
    resolve(form: string, ctx?: { prev?: string; next?: string }) {
      lex.resolveCalls++
      return table[form.toLowerCase()]?.(ctx) ?? []
    },
    matchMwe: mwe,
  }
  return lex as unknown as FakeLex
}

const statusesOf = (pairs: [string, WordStatus][]) => new Map(pairs)

describe('buildSavedMatcher', () => {
  const lex = fakeLex({})

  test('only new / learning words are marked; nothing marked → null', () => {
    expect([...MARKED].sort()).toEqual(['learning', 'new'])
    const a = word('casa', 'дом', { lexId: 'casa#noun' })
    const b = word('pão', 'хлеб')
    expect(buildSavedMatcher(lex, [a, b], statusesOf([[a.id, 'known'], [b.id, 'paused']]))).toBeNull()
    expect(buildSavedMatcher(lex, [a, b], new Map())).toBeNull()
    expect(buildSavedMatcher(lex, [], new Map())).toBeNull()
  })

  test('lexicon ids, own lemmas and multi-word phrases go to their sets; blank lemmas are skipped', () => {
    const a = word('casa', 'дом', { lexId: 'casa#noun' })
    const b = word('Pão', 'хлеб')
    const c = word('casa de banho', 'ванная', { lexId: 'casa de banho#noun' })
    const d = word('de vez em quando', 'иногда')
    const blank = word('  ', '?')
    const m = buildSavedMatcher(lex, [a, b, c, d, blank], statusesOf([a, b, c, d, blank].map((w) => [w.id, 'new'] as [string, WordStatus])))!
    expect([...m.lexIds]).toEqual(['casa#noun'])
    expect([...m.lemmas]).toEqual(['pão'])
    expect([...m.phrases].sort()).toEqual(['casa de banho', 'de vez em quando'])
    expect(m.maxPhrase).toBe(4)
  })
})

describe('savedSpans', () => {
  const slice = (text: string, spans: { start: number; end: number }[]) => spans.map((s) => text.slice(s.start, s.end))

  test('own lemma: matched by its normalised token without the lexicon', () => {
    const lex = fakeLex({})
    const w = word('xyzzy', '?')
    const m = buildSavedMatcher(lex, [w], statusesOf([[w.id, 'learning']]))!
    const text = 'Um XYZZY e outro xyzzy.'
    expect(slice(text, savedSpans(text, m))).toEqual(['XYZZY', 'xyzzy'])
    expect(lex.resolveCalls).toBe(0)
  })

  test('lexicon id: a form with one candidate is marked; other forms are not; candidates are cached', () => {
    const lex = fakeLex({ casas: () => [cand('casa#noun')], casar: () => [cand('casar#verb')], cas: () => [cand('casa#noun', true)] })
    const w = word('casa', 'дом', { lexId: 'casa#noun' })
    const m = buildSavedMatcher(lex, [w], statusesOf([[w.id, 'new']]))!
    const text = 'casas casar cas casas'
    expect(slice(text, savedSpans(text, m))).toEqual(['casas', 'casas'])
    const calls = lex.resolveCalls
    savedSpans(text, m)
    expect(lex.resolveCalls).toBe(calls)
  })

  test('ambiguous form: marked only when the context-ranked first reading is the saved one', () => {
    const lex = fakeLex({
      como: (ctx) => (ctx?.prev === 'eu' ? [cand('comer#verb'), cand('como#adv')] : [cand('como#adv'), cand('comer#verb')]),
    })
    const w = word('comer', 'есть', { lexId: 'comer#verb' })
    const m = buildSavedMatcher(lex, [w], statusesOf([[w.id, 'new']]))!
    expect(slice('Eu como pão.', savedSpans('Eu como pão.', m))).toEqual(['como'])
    expect(slice('Como estás?', savedSpans('Como estás?', m))).toEqual([])
    // context across inline elements: `prev` option
    expect(slice('como pão', savedSpans('como pão', m, { prev: 'eu' }))).toEqual(['como'])
  })

  test('ambiguous form with only approximate context readings → not marked', () => {
    const lex = fakeLex({ era: (ctx) => (ctx ? [cand('ser#verb', true), cand('era#noun', true)] : [cand('ser#verb'), cand('era#noun')]) })
    const w = word('ser', 'быть', { lexId: 'ser#verb' })
    const m = buildSavedMatcher(lex, [w], statusesOf([[w.id, 'new']]))!
    expect(savedSpans('era uma vez', m)).toEqual([])
  })

  test('phrases: longest first, span covers the tokens, then scanning continues after it', () => {
    const lex = fakeLex({})
    const p1 = word('casa de banho', '?')
    const p2 = word('casa de', '?')
    const own = word('banho', '?')
    const m = buildSavedMatcher(lex, [p1, p2, own], statusesOf([p1, p2, own].map((w) => [w.id, 'new'] as [string, WordStatus])))!
    const text = 'A casa  de banho e o banho, casa de pedra.'
    expect(slice(text, savedSpans(text, m))).toEqual(['casa  de banho', 'banho', 'casa de'])
  })

  test('phrase longer than the remaining tokens does not overrun', () => {
    const lex = fakeLex({})
    const p = word('de vez em quando', '?')
    const m = buildSavedMatcher(lex, [p], statusesOf([[p.id, 'new']]))!
    expect(savedSpans('de vez', m)).toEqual([])
  })

  test('latinOnly skips tokens with Cyrillic; non-letter tokens are skipped', () => {
    const lex = fakeLex({})
    const w = word('casa', '?')
    const m = buildSavedMatcher(lex, [w], statusesOf([[w.id, 'new']]))!
    const text = 'Слово casa значит дом, 123 casa'
    expect(slice(text, savedSpans(text, m, { latinOnly: true }))).toEqual(['casa', 'casa'])
    expect(LETTER.test('123')).toBe(false)
  })

  test('real lexicon: a saved verb is found in its conjugated and clitic forms', () => {
    const lex = loadTestLexicon()
    const id = lex.resolve('levantar-se').find((c) => !c.approximate)?.entry.id
    expect(id).toBeDefined()
    const w = word('levantar-se', 'вставать', { lexId: id })
    const m = buildSavedMatcher(lex, [w], statusesOf([[w.id, 'learning']]))!
    const text = 'Eu levanto-me cedo.'
    expect(slice(text, savedSpans(text, m))).toEqual(['levanto-me'])
  })
})

// ─── text.ts ─────────────────────────────────────────────────────────────────

describe('wordAt / wordsOf edges', () => {
  test('empty text, offsets outside the text', () => {
    expect(wordAt('', 0)).toBeNull()
    expect(wordAt('casa', -1)).toBeNull()
    expect(wordAt('casa', 99)).toBeNull()
    expect(wordAt('casa', 4)).toEqual({ start: 0, end: 4, text: 'casa' })
  })

  test('caret on the joiner of a clitic: the whole hyphenated word', () => {
    expect(wordAt('levanto-me', 7)?.text).toBe('levanto-me')
    expect(wordAt('dá-se-lhe', 2)?.text).toBe('dá-se-lhe')
    expect(wordAt('dá-se-lhe', 5)?.text).toBe('dá-se-lhe')
  })

  test('a dangling hyphen or apostrophe is not a word', () => {
    expect(wordAt('casa - rua', 5)).toBeNull()
    expect(wordAt("'", 0)).toBeNull()
  })

  test('NFD text: the word keeps its combining marks', () => {
    const s = 'A saúde.'
    expect(wordAt(s, 3)?.text).toBe('saúde')
  })

  test('wordsOf: empty and punctuation-only texts', () => {
    expect(wordsOf('')).toEqual([])
    expect(wordsOf(' ... 42 !')).toEqual([])
    expect(wordsOf('Bom-dia, d’água!').map((w) => w.text)).toEqual(['Bom-dia', 'd’água'])
  })
})

describe('without Intl.Segmenter (fallback segmentation)', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('words and sentences still work', async () => {
    vi.resetModules()
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined })
    const t = await import('@/features/words/capture/text')
    expect(t.wordAt('Eu levanto-me cedo.', 5)?.text).toBe('levanto-me')
    expect(t.wordAt('Um copo d’água', 10)?.text).toBe('d’água')
    expect(t.wordAt('42 casas', 0)).toBeNull()
    expect(t.wordAt('A  casa', 1)?.text).toBe('A')
    const text = 'Olá. Eu levanto-me cedo! Tu não?'
    const w = t.wordAt(text, 9)!
    expect(t.sentenceAt(text, w.start, w.end).text).toBe('Eu levanto-me cedo!')
    expect(t.sentenceAt('', 0, 0).text).toBe('')
    expect(t.sentenceAt('sem ponto final', 0, 3).text).toBe('sem ponto final')
  })
})

describe('sentenceAt windows', () => {
  test('word near the start: no leading ellipsis; window ≤ max + ellipses', () => {
    const tail = ' palavra'.repeat(80)
    const text = `Casa${tail}.`
    const s = sentenceAt(text, 0, 4)
    expect(s.text.startsWith('Casa')).toBe(true)
    expect(s.text.endsWith('…')).toBe(true)
    expect(s.text.length).toBeLessThanOrEqual(SENTENCE_MAX + 2)
    expect(s.text.slice(s.wordStart, s.wordEnd)).toBe('Casa')
  })

  test('word near the end: leading ellipsis only, cut at a space', () => {
    const head = 'palavra '.repeat(80)
    const text = `${head}fim`
    const s = sentenceAt(text, text.length - 3, text.length)
    expect(s.text.startsWith('…')).toBe(true)
    expect(s.text.endsWith('fim')).toBe(true)
    expect(s.text.slice(s.wordStart, s.wordEnd)).toBe('fim')
    expect(s.text[1]).not.toBe(' ')
  })

  test('a custom max smaller than the word keeps the word', () => {
    const text = 'Uma frase com a palavra extraordinariamente longa no meio dela.'
    const start = text.indexOf('extraordinariamente')
    const s = sentenceAt(text, start, start + 19, 10)
    expect(s.text.slice(s.wordStart, s.wordEnd)).toBe('extraordinariamente')
  })

  test('no spaces to cut at: hard cut with ellipses', () => {
    const text = 'x'.repeat(400)
    const s = sentenceAt(text, 200, 201)
    expect(s.text.startsWith('…') && s.text.endsWith('…')).toBe(true)
    expect(s.text.slice(s.wordStart, s.wordEnd)).toBe('x')
  })

  test('abbreviation splitting the word range: the sentence is extended to cover it', () => {
    const text = 'Falei com o Sr. Silva ontem. Depois saí.'
    const start = text.indexOf('Sr.')
    const end = text.indexOf('Silva') + 5
    const s = sentenceAt(text, start, end)
    expect(s.text).toContain('Sr. Silva')
  })
})

describe('selection / tokens', () => {
  test('selectionLookupText: punctuation only, exactly 6 words, NBSP', () => {
    expect(selectionLookupText('...')).toBeNull()
    expect(selectionLookupText('um dois três quatro cinco seis')).toBe('um dois três quatro cinco seis')
    expect(selectionLookupText('um dois')).toBe('um dois')
    expect(selectionLookupText('casa домик')).toBeNull()
  })

  test('tokenIndexAt: empty list, before the first token, in a gap, after the last', () => {
    const toks = tokenize('  casa  azul')
    expect(tokenIndexAt([], 3)).toBe(-1)
    expect(tokenIndexAt(toks, 0)).toBe(-1)
    expect(tokenIndexAt(toks, 2)).toBe(0)
    expect(tokenIndexAt(toks, 7)).toBe(0)
    expect(tokenIndexAt(toks, 99)).toBe(1)
  })
})

describe('scope rules', () => {
  const el = (tagName: string, attrs: Record<string, string> = {}, parent: ElementLike | null = null): ElementLike => ({
    tagName,
    parentElement: parent,
    getAttribute: (n) => (n in attrs ? attrs[n] : null),
    hasAttribute: (n) => n in attrs,
  })

  test('interactiveAncestor: lower-case tags, roles, contenteditable values', () => {
    expect(interactiveAncestor(null)).toBeNull()
    const btn = el('button')
    expect(interactiveAncestor(el('span', {}, btn))).toBe(btn)
    const role = el('div', { role: 'tab' })
    expect(interactiveAncestor(el('span', {}, role))).toBe(role)
    expect(interactiveAncestor(el('div', { role: 'article' }))).toBeNull()
    const ce = el('div', { contenteditable: '' })
    expect(interactiveAncestor(ce)).toBe(ce)
    expect(interactiveAncestor(el('div', { contenteditable: 'false' }))).toBeNull()
    const a = el('a', { href: '/x' })
    expect(interactiveAncestor(el('span', {}, el('a', {}, a)))).toBe(a)
  })

  test('lookupModeOf: closest lang wins; pt variants; select only outside lang', () => {
    expect(lookupModeOf(null)).toBe('none')
    expect(lookupModeOf(el('span', {}, el('div', { lang: 'PT-pt' })))).toBe('tap')
    expect(lookupModeOf(el('span', { lang: 'en' }, el('div', { lang: 'pt-PT' })))).toBe('none')
    expect(lookupModeOf(el('span', { lang: 'pt' }, el('div', { lang: 'ru' })))).toBe('tap')
    expect(lookupModeOf(el('span', { lang: 'ptx' }))).toBe('none')
    expect(lookupModeOf(el('span', {}, el('div', { 'data-lookup': 'select' })))).toBe('select')
    // a lang inside the select container decides
    expect(lookupModeOf(el('span', { lang: 'ru' }, el('div', { 'data-lookup': 'select' })))).toBe('none')
    // «on» stops the walk: an «off» above it no longer applies, but «on» alone is not pt
    expect(lookupModeOf(el('span', { 'data-lookup': 'on' }, el('div', { 'data-lookup': 'off', lang: 'pt' })))).toBe('none')
    expect(lookupModeOf(el('span', { 'data-lookup': 'on', lang: 'pt' }, el('div', { 'data-lookup': 'off' })))).toBe('tap')
  })
})

// ─── options.ts ──────────────────────────────────────────────────────────────

describe('lookupOptions', () => {
  const mwe = (start: number, end: number, ...ids: string[]): MweMatch => ({ start, end, entries: ids.map(entry) })

  test('multi-word selection: no expression search, candidates only', () => {
    const matchMwe = vi.fn(() => mwe(0, 2, 'x y#phrase'))
    const lex = fakeLex({ 'x y': () => [cand('x y#phrase')] }, matchMwe)
    const out = lookupOptions(lex, { form: 'x y', multi: true, tokens: ['x', 'y'], tokenIndex: 0 })
    expect(matchMwe).not.toHaveBeenCalled()
    expect(out.map((o) => [o.entry.id, !!o.mwe])).toEqual([['x y#phrase', false]])
  })

  test('no tokens / no index: candidates only', () => {
    const lex = fakeLex({ casa: () => [cand('casa#noun'), cand('casar#verb')] })
    expect(lookupOptions(lex, { form: 'casa', multi: false }).map((o) => o.entry.id)).toEqual(['casa#noun', 'casar#verb'])
    expect(lookupOptions(lex, { form: 'casa', multi: false, tokens: ['casa'] })).toHaveLength(2)
  })

  test('short expression first; a candidate equal to it is not repeated', () => {
    const lex = fakeLex({ banho: () => [cand('casa de banho#noun'), cand('banho#noun')] }, () => mwe(0, 3, 'casa de banho#noun'))
    const out = lookupOptions(lex, { form: 'banho', multi: false, tokens: ['casa', 'de', 'banho'], tokenIndex: 2 })
    expect(out.map((o) => [o.entry.id, !!o.mwe])).toEqual([
      ['casa de banho#noun', true],
      ['banho#noun', false],
    ])
  })

  test('long stored sentence: the longest short expression inside first, the sentence after the word', () => {
    const tokens = 'queria abrir uma conta à ordem se faz favor'.split(' ')
    const matchMwe = (toks: readonly string[], i: number): MweMatch | null => {
      if (toks.length === tokens.length) return mwe(0, 9, 'sentence#phrase')
      // windows of ≤ 4 tokens: «abrir uma conta» (3) and «uma conta» (2)
      const j = toks.indexOf('conta')
      if (j < 0 || i !== j) return null
      if (toks[j - 2] === 'abrir') return mwe(j - 2, j + 1, 'abrir uma conta#phrase')
      if (toks[j - 1] === 'uma') return mwe(j - 1, j + 1, 'uma conta#phrase')
      return null
    }
    const lex = fakeLex({ conta: () => [cand('conta#noun'), cand('contar#verb')] }, matchMwe)
    const out = lookupOptions(lex, { form: 'conta', multi: false, tokens, tokenIndex: 3 })
    expect(out.map((o) => o.entry.id)).toEqual(['abrir uma conta#phrase', 'conta#noun', 'contar#verb', 'sentence#phrase'])
  })

  test('long match with no shorter expression inside: word first, sentence last', () => {
    const lex = fakeLex({ b: () => [cand('b#noun')] }, (toks) => (toks.length === 6 ? mwe(0, 6, 'long#phrase') : null))
    const out = lookupOptions(lex, { form: 'b', multi: false, tokens: ['a', 'b', 'c', 'd', 'e', 'f'], tokenIndex: 1 })
    expect(out.map((o) => [o.entry.id, !!o.mwe])).toEqual([
      ['b#noun', false],
      ['long#phrase', true],
    ])
  })

  test('real lexicon: «de vez em quando» offers the expression first', () => {
    const lex = loadTestLexicon()
    const tokens = ['vou', 'lá', 'de', 'vez', 'em', 'quando']
    const out = lookupOptions(lex, { form: 'vez', multi: false, tokens, tokenIndex: 3 })
    expect(out.length).toBeGreaterThan(0)
    if (out[0].mwe) expect(out[0].entry.lemma.split(' ').length).toBeGreaterThan(1)
    expect(new Set(out.map((o) => o.entry.id)).size).toBe(out.length)
  })
})
