/**
 * Personal dictionary — Phase 5 integrations (pure functions):
 *   npx tsx --test scripts/integrations.test.ts
 *   (update the prompt snapshot: npx tsx --test --test-update-snapshots scripts/integrations.test.ts)
 *
 * - «Импорт списка»: line parsing (separators, empty lines, duplicates, headers) and lexicon resolution;
 * - «Мои слова»: word priority, the 30-word limit and a snapshot of the prompt;
 * - saved-word highlights: which tokens of a pt text are marked.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SrsCard, WordEntry, WordStatus } from '../src/data/types.ts'
import { createLexicon, type LexiconBundle } from '../src/engine/lexicon/lookup.ts'
import { verbForms } from '../src/engine/lexicon/conjugate.ts'
import { buildSavedMatcher, savedSpans } from '../src/features/words/capture/savedMatch.ts'
import {
  importKey,
  importRowDefault,
  importRowInput,
  parseImportList,
  resolveImportRows,
  splitImportLine,
} from '../src/features/words/importList.ts'
import { buildWordsPrompt, pickTutorWords, TUTOR_WORDS_MAX, tutorWordLine, type TutorWordState } from '../src/features/tutor/prompts.ts'

const bundle = JSON.parse(readFileSync(fileURLToPath(new URL('../src/generated/lexicon.json', import.meta.url)), 'utf8')) as LexiconBundle
const lex = createLexicon(bundle, { verbForms })

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 19, 12)

function entry(lemma: string, extra: Partial<WordEntry> = {}): WordEntry {
  return {
    id: extra.lexId ?? `u:${lemma}`,
    lemma,
    ru: 'перевод',
    sources: [],
    modes: ['recognize', 'produce', 'listen', 'cloze'],
    createdAt: NOW - DAY,
    updatedAt: NOW - DAY,
    ...extra,
  }
}

function card(over: Partial<SrsCard['fsrs']> = {}, suspended = false): SrsCard {
  return {
    id: 'c',
    kind: 'word',
    front: '',
    back: '',
    suspended,
    createdAt: NOW,
    updatedAt: NOW,
    fsrs: {
      due: NOW + DAY,
      stability: 3,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 1,
      lapses: 0,
      state: 2,
      ...over,
    } as SrsCard['fsrs'],
  }
}

// ─── Import list ─────────────────────────────────────────────────────────────

describe('importList: parsing', () => {
  test('separators: em / en dash, spaced hyphen, tab, semicolon, equals', () => {
    assert.deepEqual(splitImportLine('o pão — хлеб'), { pt: 'o pão', ru: 'хлеб' })
    assert.deepEqual(splitImportLine('a chávena – чашка'), { pt: 'a chávena', ru: 'чашка' })
    assert.deepEqual(splitImportLine('levantar-se - вставать'), { pt: 'levantar-se', ru: 'вставать' })
    assert.deepEqual(splitImportLine('fixe\tклассный, клёвый'), { pt: 'fixe', ru: 'классный, клёвый' })
    assert.deepEqual(splitImportLine('comboio; поезд'), { pt: 'comboio', ru: 'поезд' })
    assert.deepEqual(splitImportLine('sumo = сок'), { pt: 'sumo', ru: 'сок' })
    assert.deepEqual(splitImportLine('pão—хлеб'), { pt: 'pão', ru: 'хлеб' })
  })

  test('a hyphen inside a word is not a separator; meanings after the first separator stay together', () => {
    assert.equal(splitImportLine('pequeno-almoço'), null)
    assert.deepEqual(splitImportLine('pequeno-almoço — завтрак; утренний приём пищи'), { pt: 'pequeno-almoço', ru: 'завтрак; утренний приём пищи' })
  })

  test('list markers, quotes and trailing punctuation are dropped; swapped «перевод — palavra» is accepted', () => {
    assert.deepEqual(splitImportLine('1. «o autocarro» — автобус.'), { pt: 'o autocarro', ru: 'автобус' })
    assert.deepEqual(splitImportLine('- o telemóvel - мобильный'), { pt: 'o telemóvel', ru: 'мобильный' })
    assert.deepEqual(splitImportLine('• a casa de banho — ванная'), { pt: 'a casa de banho', ru: 'ванная' })
    assert.deepEqual(splitImportLine('поезд — comboio'), { pt: 'comboio', ru: 'поезд' })
  })

  test('empty lines, the «СЛОВА:» header and code fences are skipped; bad lines are reported', () => {
    const p = parseImportList('СЛОВА:\n```\no pão — хлеб\n\n   \nolá\n — без слова\nfalar —\n```\n')
    assert.equal(p.fromTutor, true)
    assert.deepEqual(
      p.items.map((i) => [i.line, i.pt, i.ru]),
      [[3, 'o pão', 'хлеб']],
    )
    assert.deepEqual(
      p.skipped.map((s) => [s.line, s.reason]),
      [
        [6, 'no-separator'],
        [7, 'no-separator'],
        [8, 'no-ru'],
      ],
    )
  })

  test('duplicates (case, article, spacing) merge into the first line; new meanings are added', () => {
    const p = parseImportList('o pão — хлеб\nPão - хлеб\npão\tбулка\nfalar — говорить')
    assert.equal(p.fromTutor, false)
    assert.equal(p.items.length, 2)
    assert.deepEqual(p.items[0], { line: 1, pt: 'o pão', ru: 'хлеб; булка', duplicates: [2, 3] })
    assert.equal(importKey('O  Pão'), importKey('pão'))
  })
})

describe('importList: lexicon', () => {
  test('lemma / pos / gender from the lexicon, article gender wins; unknown → own word', () => {
    const p = parseImportList('o autocarro — автобус\nlevanto-me — я встаю\nxyzzyq — что-то своё\nfalo — говорю\nfalar — говорить')
    const existing = new Map<string, WordEntry>()
    const rows = resolveImportRows(lex, p.items, existing)
    const [bus, rise, own, falo, falar] = rows
    assert.equal(bus.state, 'found')
    assert.equal(bus.lemma, 'autocarro')
    assert.equal(bus.pos, 'noun')
    assert.equal(bus.gender, 'm')
    assert.equal(rise.lemma, 'levantar-se')
    assert.equal(rise.pos, 'verb')
    assert.equal(own.state, 'own')
    assert.equal(own.id, 'u:xyzzyq')
    // «falo» and «falar» are the same dictionary word: the second line is a conflict, unpicked by default
    assert.equal(falo.lemma, 'falar')
    assert.equal(falar.sameAs, falo.item.line)
    assert.equal(importRowDefault(falo), true)
    assert.equal(importRowDefault(falar), false)
    const input = importRowInput(bus, { src: 'manual:import' })
    assert.equal(input.lexId, bus.entry?.id)
    assert.equal(input.ru, 'автобус')
    assert.equal(input.source?.form, 'o autocarro')
  })

  test('a word already in the dictionary is marked and not picked by default', () => {
    const rows0 = resolveImportRows(lex, parseImportList('o autocarro — автобус').items, new Map())
    const id = rows0[0].id
    const rows = resolveImportRows(lex, parseImportList('autocarro — автобус').items, new Map([[id, entry('autocarro', { lexId: id, ru: 'автобус' })]]))
    assert.equal(rows[0].state, 'exists')
    assert.equal(importRowDefault(rows[0]), false)
  })

  test('without the lexicon every line is the learner’s own word', () => {
    const rows = resolveImportRows(null, parseImportList('a chávena — чашка').items, new Map())
    assert.deepEqual([rows[0].state, rows[0].lemma, rows[0].pos, rows[0].gender, rows[0].id], ['own', 'chávena', 'noun', 'f', 'u:chávena'])
  })
})

// ─── «Мои слова» prompt ──────────────────────────────────────────────────────

describe('tutor: «Мои слова»', () => {
  const st = (lemma: string, status: WordStatus, cards: SrsCard[], extra: Partial<WordEntry> = {}): TutorWordState => ({
    entry: entry(lemma, extra),
    status,
    cards,
  })

  test('priority: due first (more lapses first), then learning, then newest new; known and paused skipped', () => {
    const items = [
      st('novo-velho', 'new', [card({ state: 0 })], { createdAt: NOW - 5 * DAY }),
      st('aprender', 'learning', [card({ due: NOW + 3 * DAY, lapses: 0 })]),
      st('conhecido', 'known', [card({ due: NOW - DAY })]),
      st('pausa', 'paused', [card({ due: NOW - DAY }, true)]),
      st('devido', 'learning', [card({ due: NOW - DAY, lapses: 1 })]),
      st('dificil', 'learning', [card({ due: NOW - 2 * DAY, lapses: 4 })]),
      st('novo-recente', 'new', [card({ state: 0 })], { createdAt: NOW - DAY / 2 }),
      st('marcado', 'new', [], { mark: 'known' }),
    ]
    assert.deepEqual(
      pickTutorWords(items, NOW).map((w) => w.lemma),
      ['dificil', 'devido', 'aprender', 'novo-recente', 'novo-velho'],
    )
  })

  test('at most 30 words', () => {
    const items = Array.from({ length: 45 }, (_, i) => st(`palavra${i}`, 'new', [card({ state: 0 })], { createdAt: NOW - i * 1000 }))
    const picked = pickTutorWords(items, NOW)
    assert.equal(picked.length, TUTOR_WORDS_MAX)
    assert.equal(picked[0].lemma, 'palavra0')
    const prompt = buildWordsPrompt(picked)
    assert.match(prompt, /\n30\. palavra29 — /)
    assert.doesNotMatch(prompt, /palavra30/)
  })

  test('line format: article, part of speech, gender, example with translation', () => {
    assert.equal(
      tutorWordLine({ lemma: 'chávena', pos: 'noun', gender: 'f', ru: 'чашка', example: 'Queria uma chávena de chá.', exampleRu: 'Я бы хотел чашку чая.' }),
      'a chávena (сущ., ж. р.) — чашка; пример: «Queria uma chávena de chá.» (Я бы хотел чашку чая.)',
    )
    assert.equal(tutorWordLine({ lemma: 'levantar-se', pos: 'verb', ru: 'вставать' }), 'levantar-se (глаг.) — вставать; пример: нет — придумай сам')
  })

  test('prompt snapshot', (t) => {
    const items = [
      st('chávena', 'learning', [card({ due: NOW - DAY, lapses: 2 })], {
        lexId: 'chávena#noun',
        pos: 'noun',
        gender: 'f',
        ru: 'чашка',
        sources: [{ src: 'situation:no-cafe:dialogue:2', form: 'chávena', sentence: 'Queria uma chávena de chá, se faz favor.', sentenceRu: 'Чашку чая, пожалуйста.', at: NOW - DAY }],
      }),
      st('levantar-se', 'learning', [card({ due: NOW + DAY })], { lexId: 'levantar-se#verb', pos: 'verb', ru: 'вставать' }),
      st('autocarro', 'new', [card({ state: 0 })], {
        lexId: 'autocarro#noun',
        pos: 'noun',
        gender: 'm',
        ru: 'автобус',
        sources: [{ src: 'reading:a2-x:paragraph:1', form: 'autocarro', sentence: 'Apanho o autocarro às oito.', at: NOW - DAY }],
      }),
      st('fixe', 'known', [card()], { ru: 'классный' }),
    ]
    const prompt = buildWordsPrompt(pickTutorWords(items, NOW), { level: 'A2' })
    t.assert.snapshot(prompt)
  })
})

// ─── Saved-word highlights ───────────────────────────────────────────────────

describe('highlights: saved-word spans', () => {
  const idOf = (form: string) => lex.resolve(form)[0]?.entry.id
  const mark = (text: string, words: WordEntry[], statuses?: Map<string, WordStatus>, latinOnly = false) => {
    const st = statuses ?? new Map(words.map((w) => [w.id, 'learning' as WordStatus]))
    const m = buildSavedMatcher(lex, words, st)
    return m ? savedSpans(text, m, { latinOnly }).map((s) => text.slice(s.start, s.end)) : []
  }

  test('inflected forms map to the saved lemma', () => {
    const falar = idOf('falar')!
    const w = entry('falar', { lexId: falar, id: falar })
    assert.deepEqual(mark('Eu falo português e eles falaram ontem.', [w]), ['falo', 'falaram'])
  })

  test('clitic forms and plurals', () => {
    const lev = idOf('levantar-se')!
    const casa = idOf('casa')!
    const words = [entry('levantar-se', { lexId: lev, id: lev }), entry('casa', { lexId: casa, id: casa })]
    assert.deepEqual(mark('Levanto-me cedo. As casas são caras.', words), ['Levanto-me', 'casas'])
  })

  test('known and paused words are not marked; new ones are', () => {
    const pao = idOf('pão')!
    const w = entry('pão', { lexId: pao, id: pao })
    assert.deepEqual(mark('O pão está bom.', [w], new Map([[w.id, 'known']])), [])
    assert.deepEqual(mark('O pão está bom.', [w], new Map([[w.id, 'paused']])), [])
    assert.deepEqual(mark('O pão está bom.', [w], new Map([[w.id, 'new']])), ['pão'])
  })

  test('multi-word lemmas match as one span; own words (u:) match by lemma', () => {
    const words = [entry('casa de banho', { lexId: 'casa de banho#noun', id: 'casa de banho#noun' }), entry('xpto')]
    assert.deepEqual(mark('Onde fica a casa de banho? É xpto.', words), ['casa de banho', 'xpto'])
  })

  test('Russian text with pt examples (markdown): Cyrillic tokens are ignored', () => {
    const pao = idOf('pão')!
    const w = entry('pão', { lexId: pao, id: pao })
    assert.deepEqual(mark('Слово pão значит «хлеб».', [w], undefined, true), ['pão'])
  })
})
