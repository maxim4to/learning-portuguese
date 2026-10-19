import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import type { LexEntrySource } from '../src/content/schema.ts'
import { guessLemmas } from '../src/engine/lexicon/guess.ts'
import { createLexicon } from '../src/engine/lexicon/lookup.ts'
import { morphHint, morphLabel, parseTags } from '../src/engine/lexicon/morph.ts'
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
import {
  BUNDLE_MAX_BYTES,
  BUNDLE_MAX_GZIP,
  buildBundle,
  contentHash,
  corpusFrequencies,
  expandEntry,
  loadContentFiles,
  mdSegments,
  parseVocabItem,
  readLexicon,
} from './lexicon.ts'
import { conjugate, isValidConj, paradigmForms, type Paradigm } from './lexicon/conjugate.ts'
import { feminine, plurals } from './lexicon/inflect.ts'
import { fileFor, isPlacedOk, sliceOf } from './lexicon/layout.ts'
import type { Tense } from '../src/engine/lexicon/endings.ts'

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
  // not in the fixture corpus: only the ending guesser finds it (approximate)
  const [g] = lex.resolve('cansados')
  assert.equal(g.entry.lemma, 'cansado')
  assert.equal(g.via, 'guess')
  assert.equal(g.approximate, true)
  assert.equal(g.tag, 'PL')
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

// ---------------------------------------------------------------------------
// Morphology: conjugation (scripts/lexicon/conjugate.ts + irregular.ts)
// ---------------------------------------------------------------------------

/** One tense as «eu tu ele nós vós eles» (variants joined with «/», missing slot «-»). */
const row = (p: Paradigm | null, t: Tense) => {
  assert.ok(p, 'paradigm expected')
  return p.tenses[t].map((c) => c.join('/') || '-').join(' ')
}
const conj = (lemma: string) => {
  const p = conjugate(lemma)
  assert.ok(p, lemma)
  return p
}

test('reference paradigm: falar (-ar), pt-PT pretérito perfeito -ámos', () => {
  const p = conj('falar')
  assert.equal(row(p, 'PI'), 'falo falas fala falamos falais falam')
  assert.equal(row(p, 'PPS'), 'falei falaste falou falámos falastes falaram')
  assert.equal(row(p, 'II'), 'falava falavas falava falávamos faláveis falavam')
  assert.equal(row(p, 'MQP'), 'falara falaras falara faláramos faláreis falaram')
  assert.equal(row(p, 'FI'), 'falarei falarás falará falaremos falareis falarão')
  assert.equal(row(p, 'CD'), 'falaria falarias falaria falaríamos falaríeis falariam')
  assert.equal(row(p, 'PC'), 'fale fales fale falemos faleis falem')
  assert.equal(row(p, 'IC'), 'falasse falasses falasse falássemos falásseis falassem')
  assert.equal(row(p, 'FC'), 'falar falares falar falarmos falardes falarem')
  assert.equal(row(p, 'IMP'), '- fala fale falemos falai falem')
  assert.equal(row(p, 'INFP'), 'falar falares falar falarmos falardes falarem')
  assert.deepEqual([p.gerund, p.participle], [['falando'], ['falado']])
})

test('reference paradigm: comer (-er)', () => {
  const p = conj('comer')
  assert.equal(row(p, 'PI'), 'como comes come comemos comeis comem')
  assert.equal(row(p, 'PPS'), 'comi comeste comeu comemos comestes comeram')
  assert.equal(row(p, 'II'), 'comia comias comia comíamos comíeis comiam')
  assert.equal(row(p, 'MQP'), 'comera comeras comera comêramos comêreis comeram')
  assert.equal(row(p, 'FI'), 'comerei comerás comerá comeremos comereis comerão')
  assert.equal(row(p, 'CD'), 'comeria comerias comeria comeríamos comeríeis comeriam')
  assert.equal(row(p, 'PC'), 'coma comas coma comamos comais comam')
  assert.equal(row(p, 'IC'), 'comesse comesses comesse comêssemos comêsseis comessem')
  assert.equal(row(p, 'FC'), 'comer comeres comer comermos comerdes comerem')
  assert.equal(row(p, 'IMP'), '- come coma comamos comei comam')
  assert.deepEqual([p.gerund, p.participle], [['comendo'], ['comido']])
})

test('reference paradigm: partir (-ir)', () => {
  const p = conj('partir')
  assert.equal(row(p, 'PI'), 'parto partes parte partimos partis partem')
  assert.equal(row(p, 'PPS'), 'parti partiste partiu partimos partistes partiram')
  assert.equal(row(p, 'II'), 'partia partias partia partíamos partíeis partiam')
  assert.equal(row(p, 'MQP'), 'partira partiras partira partíramos partíreis partiram')
  assert.equal(row(p, 'FI'), 'partirei partirás partirá partiremos partireis partirão')
  assert.equal(row(p, 'PC'), 'parta partas parta partamos partais partam')
  assert.equal(row(p, 'IC'), 'partisse partisses partisse partíssemos partísseis partissem')
  assert.equal(row(p, 'FC'), 'partir partires partir partirmos partirdes partirem')
  assert.equal(row(p, 'IMP'), '- parte parta partamos parti partam')
  assert.deepEqual([p.gerund, p.participle], [['partindo'], ['partido']])
})

test('irregular: ser, ir (shared preterite), ter, haver', () => {
  const ser = conj('ser')
  assert.equal(row(ser, 'PI'), 'sou és é somos sois são')
  assert.equal(row(ser, 'PPS'), 'fui foste foi fomos fostes foram')
  assert.equal(row(ser, 'II'), 'era eras era éramos éreis eram')
  assert.equal(row(ser, 'PC'), 'seja sejas seja sejamos sejais sejam')
  assert.equal(row(ser, 'IC'), 'fosse fosses fosse fôssemos fôsseis fossem')
  assert.equal(row(ser, 'FC'), 'for fores for formos fordes forem')
  assert.equal(row(ser, 'MQP'), 'fora foras fora fôramos fôreis foram')
  assert.equal(row(ser, 'IMP'), '- sê seja sejamos sede sejam')
  assert.equal(row(ser, 'FI'), 'serei serás será seremos sereis serão')
  assert.deepEqual([ser.gerund, ser.participle], [['sendo'], ['sido']])

  const ir = conj('ir')
  assert.equal(row(ir, 'PI'), 'vou vais vai vamos ides vão')
  assert.equal(row(ir, 'PPS'), row(ser, 'PPS'))
  assert.equal(row(ir, 'II'), 'ia ias ia íamos íeis iam')
  assert.equal(row(ir, 'PC'), 'vá vás vá vamos vades vão')
  assert.equal(row(ir, 'IMP'), '- vai vá vamos ide vão')
  assert.equal(row(ir, 'FI'), 'irei irás irá iremos ireis irão')
  assert.deepEqual([ir.gerund, ir.participle], [['indo'], ['ido']])

  const ter = conj('ter')
  assert.equal(row(ter, 'PI'), 'tenho tens tem temos tendes têm')
  assert.equal(row(ter, 'PPS'), 'tive tiveste teve tivemos tivestes tiveram')
  assert.equal(row(ter, 'II'), 'tinha tinhas tinha tínhamos tínheis tinham')
  assert.equal(row(ter, 'PC'), 'tenha tenhas tenha tenhamos tenhais tenham')
  assert.equal(row(ter, 'IC'), 'tivesse tivesses tivesse tivéssemos tivésseis tivessem')
  assert.equal(row(ter, 'FC'), 'tiver tiveres tiver tivermos tiverdes tiverem')
  assert.equal(row(ter, 'IMP'), '- tem tenha tenhamos tende tenham')

  const haver = conj('haver')
  assert.equal(row(haver, 'PI'), 'hei hás há havemos haveis hão')
  assert.equal(row(haver, 'PPS'), 'houve houveste houve houvemos houvestes houveram')
  assert.equal(row(haver, 'II'), 'havia havias havia havíamos havíeis haviam')
  assert.equal(row(haver, 'PC'), 'haja hajas haja hajamos hajais hajam')
  assert.equal(row(haver, 'IC'), 'houvesse houvesses houvesse houvéssemos houvésseis houvessem')
  assert.deepEqual(haver.participle, ['havido'])
})

test('irregular: fazer, dizer (future stems far-/dir-), pôr', () => {
  const fazer = conj('fazer')
  assert.equal(row(fazer, 'PI'), 'faço fazes faz fazemos fazeis fazem')
  assert.equal(row(fazer, 'PPS'), 'fiz fizeste fez fizemos fizestes fizeram')
  assert.equal(row(fazer, 'FI'), 'farei farás fará faremos fareis farão')
  assert.equal(row(fazer, 'CD'), 'faria farias faria faríamos faríeis fariam')
  assert.equal(row(fazer, 'PC'), 'faça faças faça façamos façais façam')
  assert.equal(row(fazer, 'IC'), 'fizesse fizesses fizesse fizéssemos fizésseis fizessem')
  assert.equal(row(fazer, 'FC'), 'fizer fizeres fizer fizermos fizerdes fizerem')
  assert.equal(row(fazer, 'IMP'), '- faz/faze faça façamos fazei façam')
  assert.deepEqual(fazer.participle, ['feito'])

  const dizer = conj('dizer')
  assert.equal(row(dizer, 'PI'), 'digo dizes diz dizemos dizeis dizem')
  assert.equal(row(dizer, 'PPS'), 'disse disseste disse dissemos dissestes disseram')
  assert.equal(row(dizer, 'FI'), 'direi dirás dirá diremos direis dirão')
  assert.equal(row(dizer, 'PC'), 'diga digas diga digamos digais digam')
  assert.equal(row(dizer, 'IC'), 'dissesse dissesses dissesse disséssemos dissésseis dissessem')
  assert.deepEqual(dizer.participle, ['dito'])

  const por = conj('pôr')
  assert.equal(row(por, 'PI'), 'ponho pões põe pomos pondes põem')
  assert.equal(row(por, 'PPS'), 'pus puseste pôs pusemos pusestes puseram')
  assert.equal(row(por, 'II'), 'punha punhas punha púnhamos púnheis punham')
  assert.equal(row(por, 'FI'), 'porei porás porá poremos poreis porão')
  assert.equal(row(por, 'PC'), 'ponha ponhas ponha ponhamos ponhais ponham')
  assert.equal(row(por, 'FC'), 'puser puseres puser pusermos puserdes puserem')
  assert.equal(row(por, 'IMP'), '- põe ponha ponhamos ponde ponham')
  assert.equal(row(por, 'INFP'), 'pôr pores pôr pormos pordes porem')
  assert.deepEqual([por.gerund, por.participle], [['pondo'], ['posto']])
})

test('irregular: vir, ver (FC «vir» = infinitive of vir), dar', () => {
  const vir = conj('vir')
  assert.equal(row(vir, 'PI'), 'venho vens vem vimos vindes vêm')
  assert.equal(row(vir, 'PPS'), 'vim vieste veio viemos viestes vieram')
  assert.equal(row(vir, 'II'), 'vinha vinhas vinha vínhamos vínheis vinham')
  assert.equal(row(vir, 'PC'), 'venha venhas venha venhamos venhais venham')
  assert.equal(row(vir, 'IC'), 'viesse viesses viesse viéssemos viésseis viessem')
  assert.equal(row(vir, 'FC'), 'vier vieres vier viermos vierdes vierem')
  assert.equal(row(vir, 'IMP'), '- vem venha venhamos vinde venham')
  assert.deepEqual([vir.gerund, vir.participle], [['vindo'], ['vindo']])

  const ver = conj('ver')
  assert.equal(row(ver, 'PI'), 'vejo vês vê vemos vedes veem')
  assert.equal(row(ver, 'PPS'), 'vi viste viu vimos vistes viram')
  assert.equal(row(ver, 'II'), 'via vias via víamos víeis viam')
  assert.equal(row(ver, 'PC'), 'veja vejas veja vejamos vejais vejam')
  assert.equal(row(ver, 'FC'), 'vir vires vir virmos virdes virem')
  assert.equal(row(ver, 'MQP'), 'vira viras vira víramos víreis viram')
  assert.equal(row(ver, 'IMP'), '- vê veja vejamos vede vejam')
  assert.deepEqual(ver.participle, ['visto'])

  const dar = conj('dar')
  assert.equal(row(dar, 'PI'), 'dou dás dá damos dais dão')
  assert.equal(row(dar, 'PPS'), 'dei deste deu demos destes deram')
  assert.equal(row(dar, 'PC'), 'dê dês dê demos/dêmos deis deem')
  assert.equal(row(dar, 'IC'), 'desse desses desse déssemos désseis dessem')
  assert.equal(row(dar, 'FC'), 'der deres der dermos derdes derem')
  assert.equal(row(dar, 'IMP'), '- dá dê demos/dêmos dai deem')
})

test('orthographic alternations: -car, -gar, -çar, -cer, -ger/-gir, -guir', () => {
  assert.equal(row(conj('ficar'), 'PPS').split(' ')[0], 'fiquei')
  assert.equal(row(conj('ficar'), 'PC'), 'fique fiques fique fiquemos fiqueis fiquem')
  assert.equal(row(conj('pagar'), 'PPS').split(' ')[0], 'paguei')
  assert.equal(row(conj('pagar'), 'PC'), 'pague pagues pague paguemos pagueis paguem')
  assert.equal(row(conj('começar'), 'PPS'), 'comecei começaste começou começámos começastes começaram')
  assert.equal(row(conj('começar'), 'PC'), 'comece comeces comece comecemos comeceis comecem')
  assert.equal(row(conj('conhecer'), 'PI').split(' ')[0], 'conheço')
  assert.equal(row(conj('conhecer'), 'PC').split(' ')[0], 'conheça')
  assert.equal(row(conj('proteger'), 'PI').split(' ')[0], 'protejo')
  assert.equal(row(conj('dirigir'), 'PC').split(' ')[0], 'dirija')
  assert.equal(row(conj('distinguir'), 'PI'), 'distingo distingues distingue distinguimos distinguis distinguem')
  assert.equal(row(conj('erguer'), 'PC').split(' ')[0], 'erga')
})

test('stem alternations and vowel-stem classes', () => {
  // e → i, o → u in PI 1s and PC; u → o (subir); -ear / odiar; -air / -uir / -oer; -uzir
  assert.equal(row(conj('sentir'), 'PI'), 'sinto sentes sente sentimos sentis sentem')
  assert.equal(row(conj('seguir'), 'PC'), 'siga sigas siga sigamos sigais sigam')
  assert.equal(row(conj('preferir'), 'PI').split(' ')[0], 'prefiro')
  assert.equal(row(conj('conseguir'), 'PI').split(' ')[0], 'consigo')
  assert.equal(row(conj('dormir'), 'PI'), 'durmo dormes dorme dormimos dormis dormem')
  assert.equal(row(conj('subir'), 'PI'), 'subo sobes sobe subimos subis sobem')
  assert.equal(row(conj('fugir'), 'PI'), 'fujo foges foge fugimos fugis fogem')
  assert.equal(row(conj('pedir'), 'PI'), 'peço pedes pede pedimos pedis pedem')
  assert.equal(row(conj('medir'), 'PC').split(' ')[0], 'meça')
  assert.equal(row(conj('ouvir'), 'PI').split(' ')[0], 'ouço/oiço')
  assert.equal(row(conj('passear'), 'PI'), 'passeio passeias passeia passeamos passeais passeiam')
  assert.equal(row(conj('passear'), 'PC'), 'passeie passeies passeie passeemos passeeis passeiem')
  assert.equal(row(conj('recear'), 'PI').split(' ')[0], 'receio')
  assert.equal(row(conj('odiar'), 'PI'), 'odeio odeias odeia odiamos odiais odeiam')
  assert.equal(row(conj('sair'), 'PI'), 'saio sais sai saímos saís saem')
  assert.equal(row(conj('sair'), 'PPS'), 'saí saíste saiu saímos saístes saíram')
  assert.equal(row(conj('cair'), 'FC'), 'cair caíres cair cairmos cairdes caírem')
  assert.equal(row(conj('construir'), 'PI'), 'construo constróis/construis constrói construímos construís constroem/construem')
  assert.equal(row(conj('destruir'), 'PI').split(' ')[2], 'destrói')
  assert.equal(row(conj('incluir'), 'PI'), 'incluo incluis inclui incluímos incluís incluem')
  assert.equal(row(conj('roer'), 'PI'), 'roo róis rói roemos roeis roem')
  assert.equal(row(conj('produzir'), 'PI').split(' ')[2], 'produz')
  assert.equal(row(conj('rir'), 'PI'), 'rio ris ri rimos rides riem')
  assert.equal(row(conj('sorrir'), 'PI'), 'sorrio sorris sorri sorrimos sorrides sorriem')
  assert.equal(row(conj('ler'), 'PI'), 'leio lês lê lemos ledes leem')
  assert.equal(row(conj('ler'), 'MQP').split(' ')[3], 'lêramos')
  assert.equal(row(conj('crer'), 'PC').split(' ')[0], 'creia')
  assert.equal(row(conj('valer'), 'PI').split(' ')[0], 'valho')
  assert.equal(row(conj('perder'), 'PC').split(' ')[0], 'perca')
  assert.equal(row(conj('caber'), 'PPS').split(' ')[0], 'coube')
  assert.equal(row(conj('saber'), 'PC').split(' ')[0], 'saiba')
  assert.equal(row(conj('poder'), 'PPS'), 'pude pudeste pôde pudemos pudestes puderam')
  assert.equal(row(conj('querer'), 'PPS').split(' ')[0], 'quis')
  assert.equal(row(conj('trazer'), 'FI').split(' ')[0], 'trarei')
  assert.equal(row(conj('estar'), 'PPS').split(' ')[0], 'estive')
  assert.equal(row(conj('reunir'), 'PI').split(' ')[0], 'reúno')
})

test('verb families (prefix + base) and participles', () => {
  assert.equal(row(conj('manter'), 'PI'), 'mantenho manténs mantém mantemos mantendes mantêm')
  assert.equal(row(conj('obter'), 'PPS').split(' ')[0], 'obtive')
  assert.equal(row(conj('convir'), 'PI').split(' ')[2], 'convém')
  assert.equal(row(conj('propor'), 'PI'), 'proponho propões propõe propomos propondes propõem')
  assert.equal(row(conj('propor'), 'INFP').split(' ')[0], 'propor')
  assert.equal(row(conj('satisfazer'), 'PI').split(' ')[0], 'satisfaço')
  assert.equal(row(conj('prever'), 'PI').split(' ')[2], 'prevê')
  assert.equal(row(conj('despedir'), 'PI').split(' ')[0], 'despeço')
  assert.deepEqual(conj('escrever').participle, ['escrito'])
  assert.deepEqual(conj('descrever').participle, ['descrito'])
  assert.deepEqual(conj('descobrir').participle, ['descoberto'])
  assert.equal(row(conj('descobrir'), 'PI').split(' ')[0], 'descubro')
  assert.deepEqual(conj('abrir').participle, ['aberto'])
  assert.deepEqual(conj('aceitar').participle, ['aceitado', 'aceite'])
  assert.deepEqual(conj('pagar').participle, ['pago'])
  assert.deepEqual(conj('levantar-se').participle, ['levantado'])
  // conj override: 'reg' disables the stem alternation
  assert.equal(conjugate('vestir', 'reg')?.tenses.PI[0][0], 'vesto')
  assert.equal(conjugate('vestir')?.tenses.PI[0][0], 'visto')
  assert.equal(isValidConj('ter'), true)
  assert.equal(isValidConj('sentir'), true)
  assert.equal(isValidConj('xyz'), false)
  assert.equal(conjugate('casa'), null)
})

test('paradigmForms: every form with all its slots', () => {
  const f = paradigmForms(conj('falar'))
  assert.deepEqual(f.get('fale'), ['PC1s', 'PC3s', 'IMP3s'])
  assert.deepEqual(f.get('falámos'), ['PPS1p'])
  assert.deepEqual(f.get('falamos'), ['PI1p'])
  assert.deepEqual(f.get('falada'), ['PPF'])
  assert.deepEqual(f.get('falando'), ['GER'])
  assert.deepEqual(paradigmForms(conj('ser')).get('foi'), ['PPS3s'])
})

// ---------------------------------------------------------------------------
// Morphology: nouns / adjectives (scripts/lexicon/inflect.ts)
// ---------------------------------------------------------------------------

test('plurals: -ão → -ões / -ães / -ãos, -l, -m, -r/-z, -s, compounds', () => {
  assert.deepEqual(plurals('canção'), ['canções'])
  assert.deepEqual(plurals('estação'), ['estações'])
  assert.deepEqual(plurals('pão'), ['pães'])
  assert.deepEqual(plurals('alemão'), ['alemães'])
  assert.deepEqual(plurals('mão'), ['mãos'])
  assert.deepEqual(plurals('irmão'), ['irmãos'])
  assert.deepEqual(plurals('cidadão'), ['cidadãos'])
  assert.deepEqual(plurals('órgão'), ['órgãos'])
  assert.deepEqual(plurals('animal'), ['animais'])
  assert.deepEqual(plurals('hotel'), ['hotéis'])
  assert.deepEqual(plurals('papel'), ['papéis'])
  assert.deepEqual(plurals('fácil'), ['fáceis'])
  assert.deepEqual(plurals('possível'), ['possíveis'])
  assert.deepEqual(plurals('barril'), ['barris'])
  assert.deepEqual(plurals('espanhol'), ['espanhóis'])
  assert.deepEqual(plurals('azul'), ['azuis'])
  assert.deepEqual(plurals('homem'), ['homens'])
  assert.deepEqual(plurals('flor'), ['flores'])
  assert.deepEqual(plurals('luz'), ['luzes'])
  assert.deepEqual(plurals('mês'), ['meses'])
  assert.deepEqual(plurals('inglês'), ['ingleses'])
  assert.deepEqual(plurals('país'), ['países'])
  assert.deepEqual(plurals('lápis'), ['lápis'])
  assert.deepEqual(plurals('mal'), ['males'])
  assert.ok(plurals('segunda-feira').includes('segundas-feiras'))
  assert.ok(plurals('guarda-chuva').includes('guarda-chuvas'))
  assert.ok(plurals('casa de banho').includes('casas de banho'))
  assert.ok(plurals('bilhete único').includes('bilhetes únicos'))
})

test('feminine: -o, -or, -ês, -ão, -eu, irregular, invariable', () => {
  assert.equal(feminine('cansado'), 'cansada')
  assert.equal(feminine('trabalhador'), 'trabalhadora')
  assert.equal(feminine('português'), 'portuguesa')
  assert.equal(feminine('alemão'), 'alemã')
  assert.equal(feminine('europeu'), 'europeia')
  assert.equal(feminine('bom'), 'boa')
  assert.equal(feminine('mau'), 'má')
  assert.equal(feminine('médico de família'), 'médica de família')
  for (const w of ['alegre', 'fácil', 'feliz', 'melhor', 'comum', 'simples']) assert.equal(feminine(w), null, w)
})

test('expandEntry: corpus-filtered forms incl. multi-word lemmas', () => {
  const corpus = new Set(['tenho de', 'tens de', 'canções', 'cansadas', 'tive de'])
  const present = (f: string) => corpus.has(f)
  assert.deepEqual(expandEntry({ lemma: 'ter de', pos: 'verb', ru: ['быть должным'] }, present), [
    ['tenho de', 'PI1s'],
    ['tens de', 'PI2s'],
    ['tive de', 'PPS1s'],
  ])
  assert.deepEqual(expandEntry({ lemma: 'canção', pos: 'noun', ru: ['песня'], gender: 'f' }, present), [['canções', 'PL']])
  assert.deepEqual(expandEntry({ lemma: 'cansado', pos: 'adj', ru: ['уставший'] }, present), [['cansadas', 'FPL']])
})

// ---------------------------------------------------------------------------
// Runtime: guesser and morph labels
// ---------------------------------------------------------------------------

test('guessLemmas: regular endings, alternations, nominal endings', () => {
  const has = (form: string, lemma: string, tag?: string) =>
    guessLemmas(form).some((g) => g.lemma === lemma && (!tag || g.tag.split(',').includes(tag)))
  assert.ok(has('falaremos', 'falar', 'FI1p'))
  assert.ok(has('falámos', 'falar', 'PPS1p'))
  assert.ok(has('comêssemos', 'comer', 'IC1p'))
  assert.ok(has('fiquei', 'ficar', 'PPS1s'))
  assert.ok(has('pague', 'pagar', 'PC1s'))
  assert.ok(has('comecei', 'começar'))
  assert.ok(has('conheço', 'conhecer', 'PI1s'))
  assert.ok(has('protejo', 'proteger'))
  assert.ok(has('sinto', 'sentir'))
  assert.ok(has('sigo', 'seguir'))
  assert.ok(has('durmo', 'dormir'))
  assert.ok(has('passeio', 'passear'))
  assert.ok(has('saímos', 'sair'))
  assert.ok(has('canções', 'canção', 'PL'))
  assert.ok(has('hotéis', 'hotel', 'PL'))
  assert.ok(has('portuguesa', 'português', 'F'))
  assert.ok(has('casinha', 'casa', 'DIM'))
  assert.ok(has('rapidamente', 'rapido', 'ADV'))
})

test('morphLabel / morphHint', () => {
  assert.equal(morphLabel('PI1s'), 'presente do indicativo (eu)')
  assert.equal(morphLabel('PC1s,PC3s,IMP3s'), 'presente do conjuntivo (eu, ele/ela); imperativo (você)')
  assert.equal(morphLabel('PPS1p'), 'pretérito perfeito (nós)')
  assert.equal(morphLabel('FPL'), 'ж. р., мн. ч.')
  assert.equal(morphLabel(''), '')
  assert.equal(morphLabel('X'), '')
  assert.equal(morphHint('PPS1p'), 'прошедшее совершённое время, 1 л. мн. ч.')
  assert.deepEqual(parseTags('IMP2s,GER'), [{ code: 'IMP2s', tense: 'IMP', person: '2s' }, { code: 'GER' }])
})

test('resolve with morphology: fixture verbs expanded through the conjugator', () => {
  const corpus = new Map(['como', 'falámos', 'fale', 'disse', 'é'].map((w) => [w, 1]))
  const lex = createLexicon(
    buildBundle(
      [
        { lemma: 'comer', pos: 'verb', ru: ['есть'], level: 'A1' },
        { lemma: 'como', pos: 'adv', ru: ['как'], level: 'A1' },
        { lemma: 'como', pos: 'conj', ru: ['как, так как'], level: 'A2' },
        { lemma: 'falar', pos: 'verb', ru: ['говорить'], level: 'A1' },
        { lemma: 'dizer', pos: 'verb', ru: ['говорить'], level: 'A1' },
        { lemma: 'ser', pos: 'verb', ru: ['быть'], level: 'A1' },
      ],
      corpus,
      new Map(),
    ),
  )
  assert.equal(lex.resolve('como', { prev: 'eu' })[0].entry.lemma, 'comer')
  assert.equal(lex.resolve('como', { prev: 'eu' })[0].tag, 'PI1s')
  assert.equal(lex.resolve('como')[0].entry.id, 'como#adv')
  assert.equal(lex.resolve('falámos')[0].tag, 'PPS1p')
  assert.equal(lex.resolve('fale')[0].tag, 'PC1s,PC3s,IMP3s')
  assert.equal(lex.resolve('disse')[0].entry.lemma, 'dizer')
  assert.equal(lex.resolve('é')[0].entry.lemma, 'ser')
  // not in the corpus → only the guesser (approximate, with a tag)
  const [g] = lex.resolve('falaremos')
  assert.deepEqual([g.entry.lemma, g.tag, g.approximate, g.via], ['falar', 'FI1p', true, 'guess'])
  assert.deepEqual(lex.resolve('fazê-lo'), []) // fazer is not in this fixture
})

test('mdSegments: pt fragments of Russian markdown', () => {
  const md = [
    'Глагол **ser** — это *estar* ✗, а **Sou o Maxim.** — пример; **fize**sse — фрагмент.',
    '| pt-PT | pt-BR |',
    '|---|---|',
    '| autocarro | ônibus |',
  ].join('\n')
  assert.deepEqual(mdSegments(md), ['ser', 'Sou o Maxim.', 'autocarro'])
})

test('layout: canonical files by part of speech and slice', () => {
  assert.equal(fileFor({ lemma: 'de', pos: 'prep' }), 'function.json')
  assert.equal(fileFor({ lemma: 'falar', pos: 'verb' }), 'verbs-d-i.json'.replace('d-i', sliceOf('falar')))
  assert.equal(fileFor({ lemma: 'água', pos: 'noun' }), `nouns-${sliceOf('a')}.json`)
  assert.equal(fileFor({ lemma: 'zangado', pos: 'adj' }), `words-${sliceOf('z')}.json`)
  assert.equal(isPlacedOk('function.json', { lemma: 'não', pos: 'adv' }), true)
  assert.equal(isPlacedOk('function.json', { lemma: 'casa', pos: 'noun' }), false)
})

// ---------------------------------------------------------------------------
// The committed lexicon (real data)
// ---------------------------------------------------------------------------

test('real lexicon: function words and irregular verbs resolve', () => {
  const lex = createLexicon(real)
  const top = (w: string, prev?: string) => lex.resolve(w, prev ? { prev } : undefined)[0]
  assert.equal(top('é').entry.id, 'ser#verb')
  assert.equal(top('é').tag, 'PI3s')
  assert.equal(top('tenho').entry.lemma, 'ter')
  assert.equal(top('há').entry.lemma, 'haver')
  assert.equal(top('vou').entry.lemma, 'ir')
  assert.equal(top('do').entry.id, 'de#prep')
  assert.equal(top('à').entry.id, 'a#prep')
  assert.equal(top('que').entry.lemma, 'que')
  assert.equal(top('minha').entry.lemma, 'meu')
  assert.equal(top('dir-lhe-ei').entry.lemma, 'dizer')
  assert.equal(top('fazê-lo').entry.lemma, 'fazer')
  assert.equal(top('como', 'eu').entry.lemma, 'comer')
  assert.equal(top('como').entry.lemma, 'como')
  assert.ok(lex.resolve('foi').some((c) => c.entry.lemma === 'ir') && lex.resolve('foi').some((c) => c.entry.lemma === 'ser'))
})

test('real lexicon: every entry placed in its canonical file, valid conj', () => {
  for (const f of readLexicon()) {
    for (const e of f.entries) {
      assert.ok(isPlacedOk(f.file, e), `${f.file}: «${e.lemma}» (${e.pos}) belongs in ${fileFor(e)}`)
      if (e.conj) assert.ok(isValidConj(e.conj), `${e.lemma}: conj ${e.conj}`)
    }
  }
})

test('bundle size: raw JSON ≤ 1 MB, gzip ≤ 250 KB (and the built lazy chunk, if dist/ exists)', (t) => {
  const json = readFileSync(bundlePath, 'utf8')
  const raw = Buffer.byteLength(json)
  const gz = gzipSync(json).length
  t.diagnostic(`src/generated/lexicon.json: ${(raw / 1024).toFixed(1)} KB raw, ${(gz / 1024).toFixed(1)} KB gzip`)
  assert.ok(raw <= BUNDLE_MAX_BYTES, `lexicon.json is ${raw} B (> 1 MB): split entries/forms`)
  assert.ok(gz <= BUNDLE_MAX_GZIP, `lexicon.json gzip is ${gz} B (> 250 KB)`)
  const assets = fileURLToPath(new URL('../dist/assets/', import.meta.url))
  if (!existsSync(assets)) return
  // the data chunk (src/generated/lexicon.json → `var e={v:1,hash:…`), not the lookup code chunk of the same name
  const chunk = readdirSync(assets).find((n) => /^lexicon-[\w-]+\.js$/.test(n) && /\{v:1,hash:/.test(readFileSync(join(assets, n), 'utf8').slice(0, 200)))
  if (!chunk) return
  const code = readFileSync(join(assets, chunk))
  const cgz = gzipSync(code).length
  t.diagnostic(`dist/assets/${chunk}: ${(code.length / 1024).toFixed(1)} KB, ${(cgz / 1024).toFixed(1)} KB gzip`)
  assert.ok(cgz <= BUNDLE_MAX_GZIP, `lazy chunk ${chunk} gzip is ${cgz} B (> 250 KB)`)
})
