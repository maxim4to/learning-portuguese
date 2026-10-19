import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { LexEntrySource } from '../src/content/schema.ts'
import { createLexicon } from '../src/engine/lexicon/lookup.ts'
import {
  analyzeForm,
  foldDiacritics,
  normalizeForm,
  splitClitics,
  splitContraction,
  stripArticle,
  tokenize,
} from '../src/engine/lexicon/normalize.ts'
import type { LexiconBundle } from '../src/engine/lexicon/types.ts'
import { lintText } from './brazilianisms.ts'
import { buildBundle, contentHash, corpusFrequencies, loadContentFiles, parseVocabItem, readLexicon, regularPlurals } from './lexicon.ts'

// ---------------------------------------------------------------------------
// normalize
// ---------------------------------------------------------------------------

test('normalizeForm: case, NFC, apostrophes, hyphens, edge punctuation', () => {
  assert.equal(normalizeForm('Levanto-me,'), 'levanto-me')
  assert.equal(normalizeForm('«Você»!'), 'você')
  assert.equal(normalizeForm('você'), 'você') // decomposed ê → NFC
  assert.equal(normalizeForm('dir‑lhe–ei'), 'dir-lhe-ei')
  assert.equal(normalizeForm('d’água'), "d'água")
  assert.equal(normalizeForm('  Se faz favor!  '), 'se faz favor')
  assert.equal(normalizeForm('...'), '')
  assert.equal(foldDiacritics('pôr açúcar'), 'por acucar')
})

test('tokenize keeps clitic forms and compounds as one token', () => {
  assert.deepEqual(
    tokenize('Levanto-me cedo e tomo o pequeno-almoço.').map((t) => t.norm),
    ['levanto-me', 'cedo', 'e', 'tomo', 'o', 'pequeno-almoço'],
  )
  const [t] = tokenize('  Dá-lo-ei')
  assert.equal(t.start, 2)
  assert.equal(t.end, 10)
})

test('contractions: de/em/a/por + article, demonstrative, pronoun, adverb', () => {
  const cases: [string, string, string][] = [
    ['do', 'de', 'o'], ['da', 'de', 'a'], ['dos', 'de', 'os'], ['das', 'de', 'as'],
    ['no', 'em', 'o'], ['na', 'em', 'a'], ['nos', 'em', 'os'], ['nas', 'em', 'as'],
    ['ao', 'a', 'o'], ['aos', 'a', 'os'], ['à', 'a', 'a'], ['às', 'a', 'as'],
    ['pelo', 'por', 'o'], ['pela', 'por', 'a'], ['pelos', 'por', 'os'], ['pelas', 'por', 'as'],
    ['num', 'em', 'um'], ['numa', 'em', 'uma'], ['dum', 'de', 'um'], ['duma', 'de', 'uma'],
    ['deste', 'de', 'este'], ['disto', 'de', 'isto'], ['nesse', 'em', 'esse'], ['naquele', 'em', 'aquele'],
    ['daquilo', 'de', 'aquilo'], ['àquele', 'a', 'aquele'], ['àquilo', 'a', 'aquilo'],
    ['dele', 'de', 'ele'], ['delas', 'de', 'elas'], ['nela', 'em', 'ela'],
    ['daqui', 'de', 'aqui'], ['daí', 'de', 'aí'], ['donde', 'de', 'onde'],
  ]
  for (const [form, prep, rest] of cases) assert.deepEqual(splitContraction(form), { prep, rest }, form)
  assert.deepEqual(splitContraction('Na'), { prep: 'em', rest: 'a' })
  for (const w of ['de', 'casa', 'nada', 'pela-se']) assert.equal(splitContraction(w), null, w)
})

test('enclitic pronouns: levanto-me, chama-se, diz-lhe, levantamo-nos', () => {
  assert.deepEqual(splitClitics('levanto-me'), { hosts: ['levanto'], clitics: ['me'], mesoclitic: false, reflexive: true })
  assert.deepEqual(splitClitics('Chama-se')?.hosts, ['chama'])
  assert.equal(splitClitics('diz-lhe')?.reflexive, false)
  assert.deepEqual(splitClitics('deu-mo')?.clitics, ['mo'])
  assert.equal(splitClitics('levantamo-nos')?.hosts[0], 'levantamos')
  for (const w of ['pequeno-almoço', 'alho-porro', 'bem-disposto', 'casa', '-me']) assert.equal(splitClitics(w), null, w)
})

test('-lo/-la/-los/-las restore the verb ending', () => {
  const first = (w: string) => splitClitics(w)?.hosts[0]
  assert.equal(first('fazê-lo'), 'fazer')
  assert.equal(first('comprá-lo'), 'comprar')
  assert.equal(first('parti-lo'), 'partir')
  assert.equal(first('pô-lo'), 'pôr')
  assert.equal(first('constituí-la'), 'constituir')
  assert.equal(first('fazemo-lo'), 'fazemos')
  assert.ok(splitClitics('fá-lo')?.hosts.includes('faz'))
  assert.ok(splitClitics('di-lo')?.hosts.includes('diz'))
  assert.ok(splitClitics('vê-los')?.hosts.includes('vês'))
})

test('mesoclisis: dir-lhe-ei → direi, far-se-ia → faria, dá-lo-ei → darei', () => {
  assert.deepEqual(splitClitics('dir-lhe-ei'), { hosts: ['direi'], clitics: ['lhe'], mesoclitic: true, reflexive: false })
  assert.deepEqual(splitClitics('far-se-ia'), { hosts: ['faria'], clitics: ['se'], mesoclitic: true, reflexive: true })
  assert.equal(splitClitics('dá-lo-ei')?.hosts[0], 'darei')
  assert.equal(splitClitics('chamar-te-íamos')?.hosts[0], 'chamaríamos')
})

test('stripArticle removes a leading article from a selection', () => {
  assert.deepEqual(stripArticle('O pequeno-almoço'), { article: 'o', rest: 'pequeno-almoço' })
  assert.deepEqual(stripArticle('uma casa de banho'), { article: 'uma', rest: 'casa de banho' })
  assert.equal(stripArticle('banco'), null)
  assert.equal(stripArticle('ter de'), null)
  assert.deepEqual(
    analyzeForm('as férias').map((a) => [a.key, a.via]),
    [['as férias', 'exact'], ['férias', 'article']],
  )
})

// ---------------------------------------------------------------------------
// lookup (fixture bundle)
// ---------------------------------------------------------------------------

const FIXTURE: LexEntrySource[] = [
  { lemma: 'levantar', pos: 'verb', ru: ['поднимать'], forms: ['levanto'], level: 'A2' },
  { lemma: 'levantar-se', pos: 'verb', ru: ['вставать'], reflexive: true, level: 'A1' },
  { lemma: 'deitar-se', pos: 'verb', ru: ['ложиться'], reflexive: true },
  { lemma: 'fazer', pos: 'verb', ru: ['делать'], level: 'A1' },
  { lemma: 'dizer', pos: 'verb', ru: ['говорить', 'сказать'], forms: ['direi'], level: 'A1' },
  { lemma: 'de', pos: 'prep', ru: ['из', 'от'], level: 'A1' },
  { lemma: 'pequeno-almoço', pos: 'noun', ru: ['завтрак'], gender: 'm', level: 'A1' },
  { lemma: 'você', pos: 'pron', ru: ['вы'], level: 'A1' },
  { lemma: 'banco', pos: 'noun', ru: ['банк', 'скамейка'], gender: 'm', level: 'A1' },
  { lemma: 'cansado', pos: 'adj', ru: ['уставший'], level: 'A1' },
  { lemma: 'casa de banho', pos: 'noun', ru: ['туалет, ванная'], gender: 'f', level: 'A1' },
  { lemma: 'de vez em quando', pos: 'adv', ru: ['время от времени'], level: 'A2' },
  { lemma: 'como', pos: 'adv', ru: ['как'], level: 'A1' },
  { lemma: 'comer', pos: 'verb', ru: ['есть'], forms: ['como'], level: 'A1' },
]
const CORPUS = new Map(['bancos', 'cansada', 'cansadas', 'levanto'].map((w) => [w, 1]))
const fixture = () =>
  createLexicon(buildBundle(FIXTURE, CORPUS, new Map([['banco#noun', ['vocab:banco-e-dinheiro']]]), 'test'))

test('resolve: exact lemma, case-insensitive', () => {
  const [c] = fixture().resolve('Fazer')
  assert.equal(c.entry.id, 'fazer#verb')
  assert.equal(c.via, 'exact')
  assert.equal(c.tag, '')
  assert.equal(c.approximate, false)
})

test('resolve: levanto-me → levantar-se first, levantar second', () => {
  const r = fixture().resolve('Levanto-me')
  assert.deepEqual(r.map((c) => c.entry.lemma), ['levantar-se', 'levantar'])
  assert.equal(r[0].via, 'clitic')
  assert.deepEqual(r[0].clitics, ['me'])
  assert.equal(r[0].matched, 'levanto')
})

test('resolve: deitar-me → reflexive lemma only', () => {
  assert.equal(fixture().resolve('deitar-me')[0]?.entry.lemma, 'deitar-se')
  assert.equal(fixture().resolve('deitar')[0]?.entry.lemma, 'deitar-se')
})

test('resolve: fazê-lo → fazer; dir-lhe-ei → dizer (mesoclisis)', () => {
  const lex = fixture()
  const f = lex.resolve('fazê-lo')[0]
  assert.equal(f.entry.lemma, 'fazer')
  assert.deepEqual(f.clitics, ['lo'])
  const d = lex.resolve('dir-lhe-ei')[0]
  assert.equal(d.entry.lemma, 'dizer')
  assert.equal(d.mesoclitic, true)
  assert.equal(d.matched, 'direi')
})

test('resolve: contraction do → de (+ o)', () => {
  const [c] = fixture().resolve('do')
  assert.equal(c.entry.lemma, 'de')
  assert.equal(c.via, 'contraction')
  assert.deepEqual(c.contraction, { prep: 'de', rest: 'o' })
})

test('resolve: leading article stripped from a selection', () => {
  const [c] = fixture().resolve('o pequeno-almoço')
  assert.equal(c.entry.lemma, 'pequeno-almoço')
  assert.equal(c.via, 'article')
  assert.equal(c.article, 'o')
  assert.equal(fixture().resolve('A casa de banho')[0]?.entry.lemma, 'casa de banho')
})

test('resolve: generated plural / feminine only when in the corpus', () => {
  const lex = fixture()
  assert.equal(lex.resolve('Bancos')[0]?.tag, 'PL')
  assert.equal(lex.resolve('cansada')[0]?.tag, 'F')
  assert.equal(lex.resolve('cansadas')[0]?.tag, 'FPL')
  assert.deepEqual(lex.resolve('cansados'), []) // not in the fixture corpus
})

test('resolve: diacritics-insensitive fallback is marked approximate', () => {
  const [c] = fixture().resolve('VOCE')
  assert.equal(c.entry.lemma, 'você')
  assert.equal(c.approximate, true)
  assert.equal(fixture().resolve('pequeno-almoco')[0]?.entry.lemma, 'pequeno-almoço')
  assert.deepEqual(fixture().resolve('xyz'), [])
  assert.deepEqual(fixture().resolve(''), [])
})

test('resolve: context ranks ambiguous forms (eu como → comer)', () => {
  const lex = fixture()
  assert.equal(lex.resolve('como', { prev: 'eu' })[0].entry.lemma, 'comer')
  assert.equal(lex.resolve('como')[0].entry.lemma, 'como')
})

test('matchMwe: longest expression around a token', () => {
  const lex = fixture()
  const toks = ['Vou', 'à', 'casa', 'de', 'banho', 'de', 'vez', 'em', 'quando']
  const m = lex.matchMwe(toks, 3)
  assert.deepEqual([m?.start, m?.end, m?.entries[0].lemma], [2, 5, 'casa de banho'])
  assert.equal(lex.matchMwe(toks, 7)?.entries[0].lemma, 'de vez em quando')
  assert.equal(lex.matchMwe(toks, 0), null)
})

test('search: pt prefix (accent-insensitive) and ru', () => {
  const lex = fixture()
  assert.equal(lex.search('pequeno')[0]?.lemma, 'pequeno-almoço')
  assert.equal(lex.search('voce')[0]?.lemma, 'você')
  assert.equal(lex.search('levanto-me')[0]?.lemma, 'levantar-se')
  assert.equal(lex.search('банк')[0]?.lemma, 'banco')
  assert.equal(lex.search('СКАМЕЙКА')[0]?.lemma, 'banco')
  assert.deepEqual(lex.search('  '), [])
})

test('themes: back-references from entries and theme keys', () => {
  const lex = fixture()
  assert.deepEqual(lex.themesOf('banco#noun'), ['vocab:banco-e-dinheiro'])
  assert.deepEqual(lex.entriesOfTheme('vocab:banco-e-dinheiro').map((e) => e.lemma), ['banco'])
  assert.equal(lex.entryById('levantar-se#verb')?.reflexive, true)
  assert.equal(lex.entryById('casa de banho#noun')?.multiword, true)
})

test('buildBundle rejects duplicate ids', () => {
  assert.throws(() => buildBundle([FIXTURE[0], FIXTURE[0]], CORPUS, new Map()), /duplicate/)
})

// ---------------------------------------------------------------------------
// seed parsing
// ---------------------------------------------------------------------------

test('seed: article stripped, gender from article / content, m/f pairs merged', () => {
  const noWarn = () => assert.fail('unexpected warning')
  assert.deepEqual(parseVocabItem('a saúde', 'здоровье', 'f', noWarn).map((e) => [e.lemma, e.pos, e.gender]), [['saúde', 'noun', 'f']])
  assert.deepEqual(parseVocabItem('o utente / a utente', 'пациент', 'mf', noWarn).map((e) => [e.lemma, e.gender]), [['utente', 'mf']])
  const [v] = parseVocabItem('o vizinho / a vizinha', 'сосед', undefined, noWarn)
  assert.deepEqual([v.lemma, v.gender, v.forms], ['vizinho', 'mf', ['vizinha']])
  assert.deepEqual(parseVocabItem('o currículo (CV)', 'резюме', undefined, noWarn).map((e) => [e.lemma, e.forms]), [['currículo', ['CV']]])
  assert.deepEqual(parseVocabItem('levantar dinheiro', 'снять деньги', undefined, noWarn)[0].pos, 'verb')
  assert.deepEqual(parseVocabItem('cansado', 'уставший', undefined, noWarn)[0].pos, 'adj')
  assert.deepEqual(parseVocabItem('o pão', 'хлеб; булочка', 'm', noWarn)[0].ru, ['хлеб', 'булочка'])
  assert.deepEqual(regularPlurals('pão'), ['pões'])
  assert.deepEqual(regularPlurals('hotel'), ['hotéis', 'hoteis'])
})

// ---------------------------------------------------------------------------
// The committed lexicon
// ---------------------------------------------------------------------------

const bundlePath = fileURLToPath(new URL('../src/generated/lexicon.json', import.meta.url))
const real = JSON.parse(readFileSync(bundlePath, 'utf8')) as LexiconBundle

test('generated bundle is up to date (npm run lexicon -- build)', () => {
  const files = loadContentFiles()
  const lexicon = readLexicon().flatMap((f) => f.entries)
  assert.equal(real.hash, contentHash(files, lexicon), 'src/generated/lexicon.json is stale — run npm run lexicon -- build')
  assert.ok(corpusFrequencies(files).size > 1000)
})

test('real lexicon: seed lemmas resolve', () => {
  const lex = createLexicon(real)
  assert.equal(lex.resolve('levanto-me')[0]?.entry.lemma, 'levantar-se')
  assert.equal(lex.resolve('Deito-me')[0]?.entry.lemma, 'deitar-se')
  assert.equal(lex.resolve('o autocarro')[0]?.entry.lemma, 'autocarro')
  assert.equal(lex.resolve('a saúde')[0]?.entry.gender, 'f')
  assert.equal(lex.resolve('hesitou')[0]?.entry.lemma, 'hesitar')
  assert.ok(lex.themesOf('saúde#noun').includes('vocab:saude'))
  assert.ok(lex.size.entries > 1000)
})

test('real lexicon: no Brazilianisms in lemmas and forms', () => {
  const problems = readLexicon().flatMap((f) =>
    f.entries.flatMap((e) => [e.lemma, ...(e.forms ?? [])].flatMap((s) => lintText(s).map((p) => `${f.file} ${s}: ${p}`))),
  )
  assert.deepEqual(problems, [])
})
