/**
 * Small feature modules: situations (cards, writing drafts, scene icons), library (cheatsheets, glossary highlight,
 * Russian plurals), practice (paths, level filter/grouping, legacy redirects), syllabus status meta.
 * react-router-dom is mocked so the hook / redirect component run without rendering.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listCheatsheets, listSituations, type Situation } from '@/content'
import { phraseCardId, phraseCards, wordCardId, wordCards, writingKey, loadWriting, saveWriting } from '@/features/situations/persist'
import { sceneIcon, sceneTint } from '@/features/situations/sceneIcon'
import { listParsedCheatsheets, parseCheatsheet, plainText } from '@/features/library/cheatsheets'
import { makeSegmenter } from '@/features/library/highlight'
import { plural } from '@/features/library/format'
import { cheatsheetHref, PRACTICE, PRACTICE_LABEL, practicePath, readingHref, situationHref, TUTOR_HREF, vocabHref } from '@/features/practice/paths'
import { groupByLevel, levelRank, useLevelFilter } from '@/features/practice/levels'
import { RedirectTo } from '@/features/practice/redirects'
import { pct, STATUS_META, STATUS_ORDER } from '@/features/syllabus/status'
import { installStorage, removeStorage } from '../helpers/A-feat-storage'

const router = vi.hoisted(() => ({
  params: new URLSearchParams(),
  setParams: (() => {}) as (...a: unknown[]) => void,
  routeParams: {} as Record<string, string | undefined>,
  location: { search: '', hash: '' },
}))
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [router.params, router.setParams],
  useParams: () => router.routeParams,
  useLocation: () => router.location,
  Navigate: (props: unknown) => props,
}))

// ─── situations ─────────────────────────────────────────────────────────────

describe('situations/persist: card specs', () => {
  const s = listSituations().find((x) => x.phrases.length && x.vocab.length)!
  it('phrase and vocab cards: ids, kinds, ru front / pt back', () => {
    expect(phraseCardId('s', 2)).toBe('ph:s:2')
    expect(wordCardId('s', 0)).toBe('w:s:0')
    const ph = phraseCards(s)
    expect(ph).toHaveLength(s.phrases.length)
    expect(ph[0]).toEqual({ id: `ph:${s.id}:0`, kind: 'phrase', front: s.phrases[0].ru, back: s.phrases[0].pt })
    const w = wordCards(s)
    expect(w[w.length - 1]).toEqual({ id: `w:${s.id}:${s.vocab.length - 1}`, kind: 'word', front: s.vocab.at(-1)!.ru, back: s.vocab.at(-1)!.pt })
    expect(phraseCards({ ...s, phrases: [] } as Situation)).toEqual([])
  })
})

describe('situations/persist: writing drafts (localStorage)', () => {
  let ls: ReturnType<typeof installStorage>
  beforeEach(() => {
    ls = installStorage('localStorage')
  })
  afterEach(() => vi.unstubAllGlobals())

  it('save / load round trip; empty text removes the draft', () => {
    expect(writingKey('x')).toBe('ptpt:v1:writing:x')
    expect(loadWriting('x')).toBe('')
    saveWriting('x', 'Olá, Ana!\nTudo bem?')
    expect(loadWriting('x')).toBe('Olá, Ana!\nTudo bem?')
    saveWriting('x', '')
    expect(ls.dump()).toEqual({})
    expect(loadWriting('x')).toBe('')
  })
  it('drafts are per situation', () => {
    saveWriting('a', 'A')
    saveWriting('b', 'B')
    expect([loadWriting('a'), loadWriting('b')]).toEqual(['A', 'B'])
  })
  it('quota error keeps the old draft; blocked or missing storage → empty, no throw', () => {
    saveWriting('x', 'old')
    ls.failSet = true
    expect(() => saveWriting('x', 'new')).not.toThrow()
    expect(loadWriting('x')).toBe('old')
    ls.failAll = true
    expect(loadWriting('x')).toBe('')
    expect(() => saveWriting('x', '')).not.toThrow()
    removeStorage('localStorage')
    expect(loadWriting('x')).toBe('')
    expect(() => saveWriting('x', 'y')).not.toThrow()
  })
})

describe('situations/sceneIcon', () => {
  it('every real situation gets a specific pictogram (not the fallback)', () => {
    const fallback = sceneIcon('zzz')
    for (const s of listSituations()) expect(sceneIcon(s.id), s.id).not.toBe(fallback)
  })
  it('first matching rule wins', () => {
    expect(sceneIcon('futebol-cafe')).toBe(sceneIcon('no-cafe'))
    expect(sceneIcon('oficina-automovel')).toBe(sceneIcon('mudanca-utilities'))
    expect(sceneIcon('oficina-automovel')).not.toBe(sceneIcon('carro'))
    expect(sceneIcon('compras-online-devolucao')).not.toBe(sceneIcon('reclamacao-loja'))
  })
  it('sceneTint is deterministic, one of four tints, spreads ids', () => {
    const ids = listSituations().map((s) => s.id)
    const tints = new Set(ids.map(sceneTint))
    expect(tints.size).toBeGreaterThan(1)
    expect(tints.size).toBeLessThanOrEqual(4)
    expect(sceneTint('no-cafe')).toBe(sceneTint('no-cafe'))
    expect(sceneTint('')).toBe('bg-ink text-surface')
    expect(typeof sceneTint('x'.repeat(10_000))).toBe('string') // 32-bit overflow stays in range
  })
})

// ─── library ────────────────────────────────────────────────────────────────

describe('library/cheatsheets', () => {
  it('plainText strips emphasis, code, links, images and collapses whitespace', () => {
    expect(plainText('**falar** _comer_ `partir` ~~x~~ [link](http://a) ![img](b.png)\n  fim')).toBe('falar comer partir x link img fim')
  })
  it('title from the leading # line, toc of ##/### (# → 2), fenced code ignored, intro = first plain paragraph', () => {
    const md = '\r\n# **Tempos** verbais\r\n\r\n## Presente ##\n\nUm parágrafo com *ênfase*.\n\n```\n## not a heading\n```\n### Pretérito `perfeito`\n# Outro\n~~~\n# no\n~~~\n'
    const c = parseCheatsheet({ id: 'tv', markdown: md })
    expect(c.title).toBe('Tempos verbais')
    expect(c.body.startsWith('## Presente')).toBe(true)
    expect(c.toc).toEqual([
      { level: 2, text: 'Presente' },
      { level: 3, text: 'Pretérito perfeito' },
      { level: 2, text: 'Outro' },
    ])
    expect(c.intro).toBe('Um parágrafo com ênfase.')
  })
  it('no title line → id as title; no plain paragraph → no intro', () => {
    const c = parseCheatsheet({ id: 'x', markdown: 'Texto inicial\n\n## A' })
    expect(c.title).toBe('x')
    expect(c.intro).toBe('Texto inicial')
    const d = parseCheatsheet({ id: 'y', markdown: '# T\n\n| a | b |\n\n- item\n\n> quote\n\n1. um' })
    expect(d.intro).toBeUndefined()
    expect(parseCheatsheet({ id: 'z', markdown: '' })).toEqual({ id: 'z', title: 'z', intro: undefined, body: '', toc: [] })
  })
  // A-17 (fixed): a paragraph that starts with emphasis is not taken for a list.
  it('intro may start with bold / italic text', () => {
    const c = parseCheatsheet({ id: 'b', markdown: '# T\n\n**Ser** e *estar*: resumo.\n\n## A' })
    expect(c.intro).toBe('Ser e estar: resumo.')
    expect(parseCheatsheet({ id: 'i', markdown: '# T\n\n*Nota:* curto.' }).intro).toBe('Nota: curto.')
  })
  it('intro skips list items and rules, whatever the marker', () => {
    for (const md of ['* a\n* b', '- a', '+ a', '1. a', '1) a', '---', '***', '> q', '| a |']) {
      expect(parseCheatsheet({ id: 'l', markdown: `# T\n\n${md}\n\nTexto.` }).intro, md).toBe('Texto.')
    }
  })
  it('hub list: preferred order, unknown ids after it; every real sheet parses with a title and toc', () => {
    const list = listParsedCheatsheets()
    expect(list).toHaveLength(listCheatsheets().length)
    expect(list.slice(0, 3).map((c) => c.id)).toEqual(['tempos-verbais', 'verbos-irregulares', 'pronomes-cliticos'])
    for (const c of list) {
      expect(c.title).not.toBe(c.id)
      expect(c.toc.length).toBeGreaterThan(0)
      expect(c.intro).toBeTruthy()
    }
  })
})

describe('library/highlight: makeSegmenter', () => {
  const join = (segs: { text: string }[]) => segs.map((s) => s.text).join('')

  it('empty / blank glossary → the whole text as one segment', () => {
    expect(makeSegmenter([])('Olá')).toEqual([{ text: 'Olá' }])
    expect(makeSegmenter([{ word: '   ' }])('Olá')).toEqual([{ text: 'Olá' }])
  })
  it('whole words only, case-insensitive, accented letters count as letters', () => {
    const seg = makeSegmenter([{ word: 'pão' }, { word: 'mar' }])
    const out = seg('O Pão e o MAR; pãozinho, amar, mar.')
    expect(out.filter((s) => s.gi !== undefined).map((s) => [s.text, s.gi])).toEqual([
      ['Pão', 0],
      ['MAR', 1],
      ['mar', 1],
    ])
    expect(join(out)).toBe('O Pão e o MAR; pãozinho, amar, mar.')
  })
  it('longest entry wins; flexible whitespace inside multi-word entries; first duplicate keeps the index', () => {
    const seg = makeSegmenter([{ word: 'pão' }, { word: 'pão de forma' }, { word: 'Pão' }])
    const out = seg('Comprei pão  de\nforma e pão.')
    expect(out.filter((s) => s.gi !== undefined).map((s) => [s.text, s.gi])).toEqual([
      ['pão  de\nforma', 1],
      ['pão', 0],
    ])
  })
  it('NFD text matches NFC glossary; regex specials are escaped; digits are word chars', () => {
    const seg = makeSegmenter([{ word: 'café' }, { word: 'Sr. (a)' }, { word: 'c++' }])
    expect(seg('café bom').find((s) => s.gi === 0)?.text).toBe('café')
    expect(seg('o Sr. (a) chegou').some((s) => s.gi === 1)).toBe(true)
    expect(seg('c++ x').some((s) => s.gi === 2)).toBe(true)
    expect(makeSegmenter([{ word: 'ano' }])('2ano ano2 ano').filter((s) => s.gi === 0)).toHaveLength(1)
  })
  // A-16 (fixed): internal whitespace of glossary words is normalised in the lookup key.
  it('a glossary entry with a double space still highlights', () => {
    const seg = makeSegmenter([{ word: 'de  manhã' }])
    expect(seg('Saio de manhã.').some((s) => s.gi === 0)).toBe(true)
    expect(makeSegmenter([{ word: 'de manhã' }])('Saio de\u00a0 manhã.').find((s) => s.gi === 0)?.text).toBe('de\u00a0 manhã')
  })
})

describe('library/format: plural', () => {
  it.each([
    [0, '0 слов'],
    [1, '1 слово'],
    [2, '2 слова'],
    [4, '4 слова'],
    [5, '5 слов'],
    [11, '11 слов'],
    [12, '12 слов'],
    [14, '14 слов'],
    [21, '21 слово'],
    [22, '22 слова'],
    [101, '101 слово'],
    [111, '111 слов'],
    [112, '112 слов'],
    [1004, '1004 слова'],
  ])('%i → %s', (n, s) => {
    expect(plural(n, 'слово', 'слова', 'слов')).toBe(s)
  })
})

// ─── practice ───────────────────────────────────────────────────────────────

describe('practice/paths', () => {
  it('section and detail hrefs', () => {
    expect(PRACTICE).toBe('/practice')
    expect(practicePath('vocab')).toBe('/practice/vocab')
    expect(situationHref('no-cafe')).toBe('/practice/situations/no-cafe')
    expect(cheatsheetHref('c')).toBe('/practice/cheatsheets/c')
    expect(vocabHref('v')).toBe('/practice/vocab/v')
    expect(readingHref('r')).toBe('/practice/reading/r')
    expect(TUTOR_HREF).toBe('/practice/tutor')
    expect(Object.keys(PRACTICE_LABEL)).toEqual(['situations', 'cheatsheets', 'vocab', 'reading', 'tutor'])
  })
})

describe('practice/levels', () => {
  afterEach(() => {
    router.params = new URLSearchParams()
  })
  it('levelRank: CEFR order, missing → after all, unknown → -1', () => {
    expect(['A1', 'A2', 'B1', 'B2'].map(levelRank)).toEqual([0, 1, 2, 3])
    expect(levelRank(undefined)).toBe(4)
    expect(levelRank('C1')).toBe(-1)
  })
  it('groupByLevel: level order, items without / with unknown level last under null, filter', () => {
    const items = [{ id: 1, level: 'B1' }, { id: 2, level: 'A1' }, { id: 3 }, { id: 4, level: 'A1' }, { id: 5, level: 'C2' }]
    expect(groupByLevel(items, 'all').map((g) => [g.level, g.items.map((i) => i.id)])).toEqual([
      ['A1', [2, 4]],
      ['B1', [1]],
      [null, [3, 5]],
    ])
    expect(groupByLevel(items, 'A1').map((g) => g.level)).toEqual(['A1'])
    expect(groupByLevel(items, 'B2')).toEqual([])
    expect(groupByLevel([], 'all')).toEqual([])
  })
  it('useLevelFilter: valid ?level, invalid / missing → all; setter replaces history', () => {
    const set = vi.fn()
    router.setParams = set
    router.params = new URLSearchParams('level=A2')
    expect(useLevelFilter()[0]).toBe('A2')
    router.params = new URLSearchParams('level=a2')
    expect(useLevelFilter()[0]).toBe('all')
    router.params = new URLSearchParams('level=C1')
    expect(useLevelFilter()[0]).toBe('all')
    router.params = new URLSearchParams()
    const [f, setF] = useLevelFilter()
    expect(f).toBe('all')
    setF('B1')
    expect(set).toHaveBeenLastCalledWith({ level: 'B1' }, { replace: true })
    setF('all')
    expect(set).toHaveBeenLastCalledWith({}, { replace: true })
  })
})

describe('practice/redirects: legacy URLs (mappings as wired in App.tsx)', () => {
  const go = (to: Parameters<typeof RedirectTo>[0]['to'], params: Record<string, string>, search = '', hash = '') => {
    router.routeParams = params
    router.location = { search, hash }
    return (RedirectTo({ to }) as unknown as { props: { to: string; replace: boolean } }).props
  }
  it.each([
    ['/situations', () => practicePath('situations'), {}, '', '', '/practice/situations'],
    ['/situation/:id?tab=vocab#voc-3', (p: { id?: string }) => situationHref(p.id ?? ''), { id: 'no-cafe' }, '?tab=vocab', '#voc-3', '/practice/situations/no-cafe?tab=vocab#voc-3'],
    ['/library', () => practicePath('cheatsheets'), {}, '', '', '/practice/cheatsheets'],
    ['/library/cheatsheet/:id', (p: { id?: string }) => cheatsheetHref(p.id ?? ''), { id: 'conectores' }, '', '', '/practice/cheatsheets/conectores'],
    ['/library/vocab/:id', (p: { id?: string }) => vocabHref(p.id ?? ''), { id: 'saude' }, '', '#w-2', '/practice/vocab/saude#w-2'],
    ['/library/reading/:id#p-2', (p: { id?: string }) => readingHref(p.id ?? ''), { id: 'x' }, '', '#p-2', '/practice/reading/x#p-2'],
    ['/tutor?item=a', () => practicePath('tutor'), {}, '?item=a', '', '/practice/tutor?item=a'],
  ])('%s', (_, to, params, search, hash, expected) => {
    expect(go(to, params, search, hash)).toEqual({ replace: true, to: expected })
  })
})

// ─── syllabus/status ────────────────────────────────────────────────────────

describe('syllabus/status', () => {
  it('STATUS_META has label + classes for every status; order exported', () => {
    expect(STATUS_ORDER).toEqual(['confident', 'learning', 'weak', 'not-started'])
    for (const s of STATUS_ORDER) {
      const m = STATUS_META[s]
      expect(m.label).toBeTruthy()
      expect(m.dot).toBeTruthy()
      expect(m.bar).toBeTruthy()
      expect(m.chip).toBeTruthy()
    }
    expect(STATUS_META.confident.label).toBe('Уверенно')
    expect(STATUS_META['not-started'].label).toBe('Не начато')
  })
  it('pct rounds to whole percent', () => {
    expect(pct(0)).toBe('0%')
    expect(pct(0.675)).toBe('68%')
    expect(pct(1)).toBe('100%')
    expect(pct(0.849)).toBe('85%')
  })
})
