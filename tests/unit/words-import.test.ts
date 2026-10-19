/**
 * src/features/words/importList.ts — what scripts/integrations.test.ts does not cover: line endings, limits,
 * NFC/NFD duplicates, header variants, separator priority, article stripping, lexicon ranking and alternatives.
 */
import { describe, expect, test } from 'vitest'
import { NOW, word } from '../fixtures/seed.ts'
import { loadTestLexicon } from '../helpers/A-words-env.ts'
import {
  IMPORT_MAX_LINES,
  importKey,
  importRowDefault,
  importRowInput,
  matchImportEntry,
  parseImportList,
  resolveImportRows,
  splitImportLine,
  stripArticle,
} from '@/features/words/importList'

const lex = loadTestLexicon()

describe('splitImportLine', () => {
  test('quotes on both sides and trailing punctuation', () => {
    expect(splitImportLine('"pão" — "хлеб"')).toEqual({ pt: 'pão', ru: 'хлеб' })
    expect(splitImportLine('“pão” — хлеб;')).toEqual({ pt: 'pão', ru: 'хлеб' })
    expect(splitImportLine('12) pão — хлеб')).toEqual({ pt: 'pão', ru: 'хлеб' })
    expect(splitImportLine('* pão — хлеб')).toEqual({ pt: 'pão', ru: 'хлеб' })
  })

  // BUG A-23: see docs/testing-bugs/A.md — quotes are stripped before the trailing punctuation, so «"хлеб".»
  // keeps a stray closing quote: the translation is saved as «хлеб"».
  test('quoted translation followed by a period', () => {
    expect(splitImportLine('"pão" — "хлеб".')).toEqual({ pt: 'pão', ru: 'хлеб' })
    expect(splitImportLine('«pão» — «хлеб».')).toEqual({ pt: 'pão', ru: 'хлеб' })
  })

  test('em dash beats the later «;» / «=»; tab beats everything', () => {
    expect(splitImportLine('pão — хлеб; батон')).toEqual({ pt: 'pão', ru: 'хлеб; батон' })
    expect(splitImportLine('pão\tхлеб — батон')).toEqual({ pt: 'pão', ru: 'хлеб — батон' })
    expect(splitImportLine('fim-de-semana - выходные')).toEqual({ pt: 'fim-de-semana', ru: 'выходные' })
  })

  test('swap only when the left side is Russian and the right side is Latin', () => {
    expect(splitImportLine('хлеб — pão')).toEqual({ pt: 'pão', ru: 'хлеб' })
    expect(splitImportLine('хлеб — 123')).toEqual({ pt: 'хлеб', ru: '123' })
    expect(splitImportLine('pão — bread')).toEqual({ pt: 'pão', ru: 'bread' })
  })

  test('nothing usable → null', () => {
    expect(splitImportLine('')).toBeNull()
    expect(splitImportLine('olá')).toBeNull()
    expect(splitImportLine(' — ')).toBeNull()
  })

  // BUG A-22: see docs/testing-bugs/A.md — «palavra = перевод; другой перевод»: «;» is tried before «=», so the
  // Portuguese side becomes «palavra = перевод» (has Cyrillic) and the whole line is skipped as «no-pt».
  test('«=» with several «;»-separated meanings keeps the word', () => {
    expect(splitImportLine('sumo = сок; нектар')).toEqual({ pt: 'sumo', ru: 'сок; нектар' })
  })
})

describe('parseImportList', () => {
  test('CRLF / CR / LF line numbers', () => {
    const p = parseImportList('pão — хлеб\r\nsumo — сок\rleite — молоко\n')
    expect(p.items.map((i) => [i.line, i.pt])).toEqual([
      [1, 'pão'],
      [2, 'sumo'],
      [3, 'leite'],
    ])
  })

  test.each(['Words', 'palavras:', '  слова  ', 'СЛОВА :'])('header %j marks the text as from the tutor', (h) => {
    expect(parseImportList(`${h}\npão — хлеб`).fromTutor).toBe(true)
  })

  test('NFD and NFC spellings are one word; same meaning in another case is not added twice', () => {
    const p = parseImportList(`pão — хлеб\n${'pão'.normalize('NFD')} — Хлеб\nPÃO — батон`)
    expect(p.items).toHaveLength(1)
    expect(p.items[0]).toEqual({ line: 1, pt: 'pão', ru: 'хлеб; батон', duplicates: [2, 3] })
  })

  test('a duplicate meaning already in a merged list is not repeated', () => {
    const p = parseImportList('pão — хлеб; батон\npão — батон')
    expect(p.items[0].ru).toBe('хлеб; батон')
  })

  test('Cyrillic on both sides → no-pt; text kept trimmed for the report', () => {
    const p = parseImportList('   хлеб — батон   ')
    expect(p.items).toEqual([])
    expect(p.skipped).toEqual([{ line: 1, text: 'хлеб — батон', reason: 'no-pt' }])
  })

  test(`more than ${IMPORT_MAX_LINES} distinct words: the rest is reported as too-many, duplicates still merge`, () => {
    const lines = Array.from({ length: IMPORT_MAX_LINES + 5 }, (_, i) => `palavra${i} — слово${i}`)
    lines.push('palavra0 — ещё значение')
    const p = parseImportList(lines.join('\n'))
    expect(p.items).toHaveLength(IMPORT_MAX_LINES)
    expect(p.skipped.map((s) => s.reason)).toEqual(Array(5).fill('too-many'))
    expect(p.skipped[0].line).toBe(IMPORT_MAX_LINES + 1)
    expect(p.items[0].ru).toBe('слово0; ещё значение')
    expect(p.items[0].duplicates).toEqual([IMPORT_MAX_LINES + 6])
  })

  test('a huge paste (10 000 lines) is parsed quickly', () => {
    const text = Array.from({ length: 10_000 }, (_, i) => `p${i % 400} — s${i}`).join('\n')
    const t0 = performance.now()
    const p = parseImportList(text)
    expect(performance.now() - t0).toBeLessThan(2000)
    expect(p.items).toHaveLength(IMPORT_MAX_LINES)
  })

  test('empty text', () => {
    expect(parseImportList('')).toEqual({ items: [], skipped: [], fromTutor: false })
  })
})

describe('stripArticle / importKey', () => {
  test.each([
    ['o pão', { article: 'o', rest: 'pão' }],
    ['Os/As alunos', { article: 'os/as', rest: 'alunos' }],
    ['uma casa', { article: 'uma', rest: 'casa' }],
    ['pão (m)', { rest: 'pão' }],
    ['o (m) pão', { article: 'o', rest: 'pão' }],
    ['a', { rest: 'a' }],
    ['ovo', { rest: 'ovo' }],
    ['  a   casa  ', { article: 'a', rest: 'casa' }],
  ])('%j', (pt, out) => expect(stripArticle(pt)).toEqual(out))

  test('importKey: article, case, spacing and NFD are ignored', () => {
    expect(importKey('A  Saúde')).toBe(importKey('saúde'))
  })
})

describe('matchImportEntry / resolveImportRows', () => {
  test('unknown word: no entry, no alternatives', () => {
    expect(matchImportEntry(lex, 'xyzzyqwerty')).toEqual({ alternatives: [] })
  })

  test('an article prefers a noun reading', () => {
    const m = matchImportEntry(lex, 'o jantar')
    expect(m.entry?.pos).toBe('noun')
  })

  test('ambiguous forms list up to 3 distinct alternatives', () => {
    const m = matchImportEntry(lex, 'como')
    expect(m.entry).toBeDefined()
    expect(m.alternatives.length).toBeLessThanOrEqual(3)
    const ids = [m.entry!.id, ...m.alternatives.map((a) => a.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('the written article sets the gender of a noun row', () => {
    const [r] = resolveImportRows(lex, parseImportList('a jantar — ужин').items, new Map())
    expect(r.pos).toBe('noun')
    expect(r.gender).toBe('f')
  })

  test('rows without the lexicon: articles → noun with gender, otherwise unknown pos', () => {
    const rows = resolveImportRows(null, parseImportList('os óculos — очки\nlevantar-se — вставать\no/a colega — коллега').items, new Map())
    expect(rows.map((r) => [r.lemma, r.pos, r.gender, r.state])).toEqual([
      ['óculos', 'noun', 'm', 'own'],
      ['levantar-se', undefined, undefined, 'own'],
      ['colega', 'noun', 'mf', 'own'],
    ])
  })

  test('two own words that normalise to one id: the second is a conflict', () => {
    const rows = resolveImportRows(null, parseImportList('xyzzy — а\no xyzzy — б').items, new Map())
    // both lines have the same import key, so they were merged at parse time
    expect(rows).toHaveLength(1)
    const rows2 = resolveImportRows(null, [
      { line: 1, pt: 'Xyzzy', ru: 'а', duplicates: [] },
      { line: 5, pt: 'xyzzy', ru: 'б', duplicates: [] },
    ], new Map())
    expect(rows2[1].sameAs).toBe(1)
    expect(importRowDefault(rows2[0])).toBe(true)
    expect(importRowDefault(rows2[1])).toBe(false)
  })

  test('existing entry → exists, carried for the UI', () => {
    const e = word('xyzzy', 'old')
    const [r] = resolveImportRows(null, parseImportList('xyzzy — new').items, new Map([[e.id, e]]))
    expect(r.state).toBe('exists')
    expect(r.existing).toBe(e)
  })

  test('importRowInput: own row, source time from opts', () => {
    const [r] = resolveImportRows(null, parseImportList('o xyzzy — штука').items, new Map())
    expect(importRowInput(r, { src: 'manual:import', now: NOW })).toEqual({
      lexId: undefined,
      lemma: 'xyzzy',
      ru: 'штука',
      pos: 'noun',
      gender: 'm',
      level: undefined,
      source: { src: 'manual:import', form: 'o xyzzy', at: NOW },
    })
  })
})
