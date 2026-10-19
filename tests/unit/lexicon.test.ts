/**
 * engine/lexicon/*: edge cases on top of scripts/lexicon.test.ts — real bundle (src/generated/lexicon.json) with the
 * runtime conjugator: odd inputs, clitics / mesoclisis restorations, contractions, homographs with context,
 * proper-noun bias, MWE bounds, ru/pt search ranking, lazy loading; extra reference paradigms; morph tags; guesser.
 */
import { describe, expect, test } from 'vitest'
import bundleJson from '@/generated/lexicon.json'
import { conjugate, isValidConj, slot, verbClass, verbForms, verbKind } from '@/engine/lexicon/conjugate'
import { guessLemmas } from '@/engine/lexicon/guess'
import { createLexicon, getLoadedLexicon, loadLexicon, preloadLexicon, type LexCandidate, type LexiconBundle } from '@/engine/lexicon/lookup'
import { isVerbTag, morphHint, morphLabel, parseTags } from '@/engine/lexicon/morph'
import { analyzeForm, reflexiveLemma, splitClitics, splitContraction, stripArticle, tokenize } from '@/engine/lexicon/normalize'
import type { Tense } from '@/engine/lexicon/endings'

const bundle = bundleJson as unknown as LexiconBundle
const lex = createLexicon(bundle, { verbForms })
const top = (q: string, ctx?: { prev?: string; next?: string }) => lex.resolve(q, ctx).map((c: LexCandidate) => c.entry.id)

describe('createLexicon', () => {
  test('rejects an unknown bundle version', () => {
    expect(() => createLexicon({ ...bundle, v: 2 as 1 })).toThrow(/version 2/)
  })

  test('empty bundle: everything returns empty, no throw', () => {
    const empty = createLexicon({ v: 1, hash: 'x', entries: [], forms: {}, themes: {} })
    expect(empty.size).toEqual({ entries: 0, forms: 0 })
    expect(empty.resolve('casa')).toEqual([])
    expect(empty.search('casa')).toEqual([])
    expect(empty.search('дом')).toEqual([])
    expect(empty.matchMwe(['casa', 'de', 'banho'], 0)).toBeNull()
    expect(empty.entryById('x')).toBeUndefined()
    expect(empty.entryAt(0)).toBeUndefined()
    expect(empty.themesOf('x')).toEqual([])
    expect(empty.entriesOfTheme('vocab:x')).toEqual([])
  })

  test('without verbForms only the corpus-bound forms index is used', () => {
    const bare = createLexicon(bundle)
    // a clitic host outside the corpus needs the generator
    expect(lex.resolve('levantámo-nos').length).toBeGreaterThan(0)
    expect(() => bare.resolve('levantámo-nos')).not.toThrow()
  })

  test('size / hash / entry accessors on the real bundle', () => {
    expect(lex.size.entries).toBe(bundle.entries.length)
    expect(lex.hash).toBe(bundle.hash)
    const casa = lex.entryById('casa#noun')!
    expect(lex.entryAt(casa.index)).toBe(casa)
    expect(casa.ru.length).toBeGreaterThan(0)
  })
})

describe('resolve: odd inputs', () => {
  test.each(['', '   ', '...', '«»', '😀', '123456', '-', "'", '—'])('%j → no candidates, no throw', (q) => {
    expect(lex.resolve(q)).toEqual([])
  })

  test('case, edge punctuation, NFD all normalise to the same lookup', () => {
    expect(top('ESTÁ')[0]).toBe('estar#verb')
    expect(top('está'.normalize('NFD'))[0]).toBe('estar#verb')
    expect(top('«Está?»')[0]).toBe('estar#verb')
  })

  test('candidates are unique by entry', () => {
    for (const q of ['a', 'se', 'do', 'como', 'levanto-me', 'para', 'demos']) {
      const ids = top(q)
      expect(new Set(ids).size, q).toBe(ids.length)
    }
  })

  test('a very long garbage token is handled quickly', () => {
    const t0 = performance.now()
    expect(lex.resolve('x'.repeat(5000))).toEqual([])
    expect(performance.now() - t0).toBeLessThan(500)
  })
})

describe('resolve: clitics, mesoclisis, contractions, homographs', () => {
  test.each([
    ['levanto-me', 'levantar-se#verb'],
    ['Levanto-me,', 'levantar-se#verb'],
    ['sentou-se', 'sentar-se#verb'],
    ['dá-lho', 'dar#verb'],
    ['deram-lho', 'dar#verb'],
    ['põe-no', 'pôr#verb'],
    ['fá-lo-ei', 'fazer#verb'],
    ['vê-lo-ás', 'ver#verb'],
    ['dir-se-ia', 'dizer#verb'],
    ['falaremos', 'falar#verb'],
    ['dêmos', 'dar#verb'],
    ['vês', 'ver#verb'],
  ])('%s → %s first', (q, id) => {
    expect(top(q)[0]).toBe(id)
  })

  test('clitic hosts only resolve to verbs (pô-lo → pôr, not the preposition «por»)', () => {
    const c = lex.resolve('pô-lo')
    expect(c[0].entry.id).toBe('pôr#verb')
    expect(c.every((x) => x.entry.pos === 'verb')).toBe(true)
    expect(c[0]).toMatchObject({ via: 'clitic', clitics: ['lo'], mesoclitic: false })
  })

  test('mesoclitic flag and clitics are reported', () => {
    expect(lex.resolve('fá-lo-ei')[0]).toMatchObject({ via: 'clitic', clitics: ['lo'], mesoclitic: true, tag: 'FI1s' })
  })

  test('contractions report prep + rest; the preposition ranks first', () => {
    const [first] = lex.resolve('do')
    expect(first.entry.id).toBe('de#prep')
    expect(first.contraction).toEqual({ prep: 'de', rest: 'o' })
    expect(top('num')).toEqual(expect.arrayContaining(['em#prep', 'um#det']))
    expect(top('daquela')).toEqual(expect.arrayContaining(['de#prep', 'aquele#det']))
  })

  // A-03 (fixed): the preposition half of «àquele»/«ao» no longer matches the feminine article «a» (→ «o»).
  test('«àquele» = a + aquele: no spurious article «o» before «aquele» [BUG A-03]', () => {
    expect(top('àquele')).toEqual(['a#prep', 'aquele#det'])
  })

  test('contraction halves: the preposition half is only the preposition, the other half never is', () => {
    expect(top('ao')).toEqual(['a#prep', 'o#det', 'o#pron'])
    // «à» = a + a: the preposition once, then the article (not a#prep twice / not missing)
    expect(top('à')[0]).toBe('a#prep')
    expect(top('à')).toContain('o#det')
    expect(top('da')).not.toContain('a#prep')
    expect(top('pelo')).toEqual(['por#prep', 'o#det', 'o#pron'])
  })

  // A-04 (fixed): elided «d'» (copo d'água, caixa d'óculos) is split as de + noun.
  test("«d'água» resolves to água (de + água) [BUG A-04]", () => {
    expect(top('d’água')).toEqual(['de#prep', 'água#noun'])
    expect(top("d'óculos")).toContain('óculos#noun')
    expect(splitContraction("d'água")).toEqual({ prep: 'de', rest: 'água' })
    expect(splitContraction('d')).toBeNull()
  })

  test('leading article stripped from a selection', () => {
    expect(lex.resolve('o pequeno-almoço')[0]).toMatchObject({ via: 'article', article: 'o' })
  })

  test('accent-insensitive fallback marks the match approximate', () => {
    const [c] = lex.resolve('acucar')
    expect(c.entry.id).toBe('açúcar#noun')
    expect(c.approximate).toBe(true)
    expect(lex.resolve('pára').every((x) => x.approximate)).toBe(true) // pre-AO spelling
  })

  test('context: after a subject pronoun the verb reading wins; after an article the non-verb', () => {
    expect(top('como', { prev: 'eu' })[0]).toBe('comer#verb')
    expect(top('como', { prev: 'o' })[0]).not.toBe('comer#verb')
  })

  test('fui / foi: both ser and ir are offered', () => {
    expect(top('fui')).toEqual(expect.arrayContaining(['ser#verb', 'ir#verb']))
    expect(top('foi', { prev: 'ele' })).toEqual(expect.arrayContaining(['ser#verb', 'ir#verb']))
  })

  test('proper-noun homographs: Porto mid-sentence → city; lower case → common noun', () => {
    expect(top('Porto', { prev: 'no' })[0]).toBe('Porto#noun')
    expect(top('porto')[0]).toBe('porto#noun')
    expect(top('Porto')[0]).toBe('porto#noun') // sentence start: no prev
  })

  // A-05 (fixed): «sede» (thirst) is in the lexicon; «ser, imperativo vós» comes second.
  test('«tenho sede»: the noun «sede» (жажда) is offered [BUG A-05]', () => {
    expect(top('sede', { prev: 'muita' }).slice(0, 2)).toEqual(['sede#noun', 'ser#verb'])
    expect(top('sede')[0]).toBe('sede#noun')
  })

  // Homographs of a verb form with a common noun / adverb / adjective: both readings exist, context picks.
  test.each([
    // [form, nominal/other context, its reading, verbal context, verb reading]
    ['era', 'uma', 'era#noun', 'ele', 'ser#verb'],
    ['vinha', 'a', 'vinha#noun', 'eu', 'vir#verb'],
    ['saia', 'uma', 'saia#noun', 'ele', 'sair#verb'],
    ['gosto', 'o', 'gosto#noun', 'eu', 'gostar#verb'],
    ['peso', 'o', 'peso#noun', 'eu', 'pesar#verb'],
    ['venda', 'à', 'venda#noun', 'ele', 'vender#verb'],
    ['casa', 'a', 'casa#noun', 'ela', 'casar#verb'],
    ['conta', 'a', 'conta#noun', 'ele', 'contar#verb'],
    ['leve', 'muito', 'leve#adj', 'ele', 'levar#verb'],
  ])('homograph «%s»: after «%s» → %s, after «%s» → %s', (form, nominal, noun, verbal, verb) => {
    expect(top(form, { prev: nominal })[0]).toBe(noun)
    expect(top(form, { prev: verbal })[0]).toBe(verb)
  })

  test('homographs without context: the everyday reading first', () => {
    expect(top('fora')[0]).toBe('fora#adv') // lá fora — not «ir/ser, mais-que-perfeito»
    expect(top('fora')).toEqual(expect.arrayContaining(['ir#verb', 'ser#verb']))
    expect(top('era')[0]).toBe('ser#verb') // «era» = was, far more frequent than «эпоха»
    expect(top('gosto')[0]).toBe('gostar#verb') // «Gosto de…»
    expect(top('par', { prev: 'um' })[0]).toBe('par#noun')
    expect(top('sou')).toEqual(['ser#verb'])
    expect(top('sobre')[0]).toBe('sobre#prep')
    expect(top('como', { prev: 'eu' })[0]).toBe('comer#verb')
  })

  test('«pé» is masculine «нога»; «a pé» resolves to the adverbial expression first', () => {
    const pe = lex.entryById('pé#noun')!
    expect(pe.gender).toBe('m')
    expect(pe.ru[0]).toMatch(/нога/)
    expect(top('a pé')[0]).toBe('a pé#adv')
  })

  test('unknown inflection: guesser proposes only existing lemmas, marked approximate', () => {
    for (const q of ['cantaríamos', 'casinhas', 'livrinhos', 'rapidíssimo', 'falarias']) {
      const c = lex.resolve(q)
      if (c[0]?.via === 'guess') {
        expect(c.every((x) => x.approximate), q).toBe(true)
        expect(c.length, q).toBeLessThanOrEqual(3)
      }
    }
  })
})

describe('matchMwe', () => {
  test('out of range / single tokens → null', () => {
    expect(lex.matchMwe(['casa', 'de', 'banho'], -1)).toBeNull()
    expect(lex.matchMwe(['casa', 'de', 'banho'], 3)).toBeNull()
    expect(lex.matchMwe([], 0)).toBeNull()
    expect(lex.matchMwe(['casa'], 0)).toBeNull()
  })

  test('finds the expression from any of its tokens, case/punctuation-insensitive', () => {
    const toks = ['Vou', 'à', 'Casa', 'de', 'banho,', 'já']
    for (const i of [2, 3, 4]) {
      const m = lex.matchMwe(toks, i)
      expect(m, String(i)).toMatchObject({ start: 2, end: 5 })
      expect(m!.entries.map((e) => e.id)).toContain('casa de banho#noun')
      expect(m!.entries.every((e) => e.multiword)).toBe(true)
    }
    expect(lex.matchMwe(toks, 5)).toBeNull()
  })
})

describe('search', () => {
  test('empty / whitespace → []', () => {
    expect(lex.search('')).toEqual([])
    expect(lex.search('   ')).toEqual([])
  })

  test('regex metacharacters in a Russian query do not throw', () => {
    for (const q of ['(', 'дом)', '[', 'a+b', '\\', 'д*']) expect(() => lex.search(q)).not.toThrow()
  })

  test('ru: whole meaning first, then word prefix; ё = е; limit respected', () => {
    const r = lex.search('дом', 5)
    expect(r.length).toBeLessThanOrEqual(5)
    expect(r[0].ru.some((m) => m.toLowerCase() === 'дом')).toBe(true)
    expect(lex.search('ёлка').map((e) => e.id)).toEqual(lex.search('елка').map((e) => e.id))
    expect(lex.search('ДОМ', 3).map((e) => e.id)).toEqual(lex.search('дом', 3).map((e) => e.id))
  })

  test('pt: accent-insensitive prefix; exact lemma first; single words before expressions', () => {
    const r = lex.search('acucar')
    expect(r[0].id).toBe('açúcar#noun')
    const casa = lex.search('casa')
    expect(casa[0].id).toBe('casa#noun')
    const firstPhrase = casa.findIndex((e) => e.pos === 'phrase')
    const lastWord = casa.map((e) => e.pos !== 'phrase').lastIndexOf(true)
    if (firstPhrase >= 0) expect(firstPhrase).toBeGreaterThan(casa.findIndex((e) => e.pos !== 'phrase'))
    expect(lastWord).toBeGreaterThanOrEqual(0)
  })

  test('pt: an inflected form finds its lemma; inner substrings need ≥ 3 letters', () => {
    expect(lex.search('levanto-me')[0].id).toBe('levantar-se#verb')
    expect(lex.search('almoço').map((e) => e.id)).toEqual(expect.arrayContaining(['almoço#noun', 'pequeno-almoço#noun']))
  })

  test('capitalised query is a proper-noun request', () => {
    expect(lex.search('Porto')[0].id).toBe('Porto#noun')
  })

  test('limit 0 → []', () => {
    expect(lex.search('casa', 0)).toEqual([])
  })
})

describe('themes', () => {
  test('every theme key lists entries that point back to it', () => {
    for (const [key, idxs] of Object.entries(bundle.themes).slice(0, 50)) {
      for (const e of lex.entriesOfTheme(key)) expect(e.themes).toContain(key)
      expect(lex.entriesOfTheme(key)).toHaveLength(idxs.length)
    }
  })
})

describe('loadLexicon (lazy chunk)', () => {
  test('memoised: one instance; getLoadedLexicon after load; preload never throws', async () => {
    expect(() => preloadLexicon()).not.toThrow()
    const a = await loadLexicon()
    const b = await loadLexicon()
    expect(a).toBe(b)
    expect(getLoadedLexicon()).toBe(a)
    expect(a.resolve('casa')[0].entry.id).toBe('casa#noun')
  })
})

// ─── normalize ───────────────────────────────────────────────────────────────

describe('normalize: clitics, contractions, articles', () => {
  test.each([
    ['fá-lo-ei', ['farei']],
    ['dá-lo-ei', ['darei']],
    ['lê-lo-ei', ['lerei']],
    ['pô-lo-ia', ['poria']],
    ['possuí-lo-ei', ['possuirei']],
    ['di-lo-ei', ['direi']],
    ['dir-lhe-ei', ['direi']],
    ['far-se-ia', ['faria']],
  ])('mesoclisis %s → hosts %j', (form, hosts) => {
    expect(splitClitics(form)).toMatchObject({ hosts, mesoclitic: true })
  })

  test('enclisis restorations before -lo', () => {
    expect(splitClitics('comprá-lo')!.hosts[0]).toBe('comprar')
    expect(splitClitics('fazê-lo')!.hosts[0]).toBe('fazer')
    expect(splitClitics('parti-lo')!.hosts[0]).toBe('partir')
    expect(splitClitics('pô-lo')!.hosts).toContain('pôr')
    expect(splitClitics('possuí-lo')!.hosts[0]).toBe('possuir')
    expect(splitClitics('fazemo-lo')!.hosts[0]).toBe('fazemos')
    expect(splitClitics('levantamo-nos')!.hosts).toEqual(['levantamos', 'levantamo'])
  })

  test('non-clitic hyphenated words and odd shapes are not split', () => {
    expect(splitClitics('pequeno-almoço')).toBeNull()
    expect(splitClitics('-me')).toBeNull()
    expect(splitClitics('casa')).toBeNull()
    expect(splitClitics('dá me')).toBeNull()
    // middle part not a clitic → treated as enclisis attempt and rejected
    expect(splitClitics('dir-xx-ei')).toBeNull()
  })

  test('multiple clitics keep written order; reflexive only from the first', () => {
    expect(splitClitics('deu-mo')).toMatchObject({ clitics: ['mo'], reflexive: false })
    expect(splitClitics('lembra-se-lhe')).toMatchObject({ clitics: ['se', 'lhe'], reflexive: true })
  })

  test('contractions: full table spot checks and non-contractions', () => {
    expect(splitContraction('Dum')).toEqual({ prep: 'de', rest: 'um' })
    expect(splitContraction('noutras')).toEqual({ prep: 'em', rest: 'outras' })
    expect(splitContraction('às')).toEqual({ prep: 'a', rest: 'as' })
    expect(splitContraction('àquilo')).toEqual({ prep: 'a', rest: 'aquilo' })
    expect(splitContraction('pelas')).toEqual({ prep: 'por', rest: 'as' })
    expect(splitContraction('aonde')).toEqual({ prep: 'a', rest: 'onde' })
    expect(splitContraction('dantes')).toEqual({ prep: 'de', rest: 'antes' })
    for (const w of ['de', 'casa', 'nada', 'dona', '']) expect(splitContraction(w)).toBeNull()
  })

  test('stripArticle needs a following word', () => {
    expect(stripArticle('as casas')).toEqual({ article: 'as', rest: 'casas' })
    expect(stripArticle('o')).toBeNull()
    expect(stripArticle('casa')).toBeNull()
  })

  test('analyzeForm: empty → []; selections with spaces skip contraction/clitic analysis', () => {
    expect(analyzeForm('  ')).toEqual([])
    expect(analyzeForm('do mar').map((a) => a.via)).toEqual(['exact'])
    expect(analyzeForm('do').map((a) => a.via)).toEqual(['exact', 'contraction', 'contraction'])
  })

  test('reflexiveLemma', () => {
    expect(reflexiveLemma('Levantar')).toBe('levantar-se')
    expect(reflexiveLemma('levantar-se')).toBeNull()
    expect(reflexiveLemma('ter de')).toBeNull()
  })

  test('tokenize: offsets; unicode letters; apostrophes unified inside words', () => {
    const text = '«Olá», disse a Zé — copo d’água às 9h!'
    const toks = tokenize(text)
    for (const t of toks) expect(text.slice(t.start, t.end).replace('’', "'")).toBe(t.text)
    expect(toks.map((t) => t.norm)).toEqual(['olá', 'disse', 'a', 'zé', 'copo', "d'água", 'às', '9h'])
    expect(tokenize('')).toEqual([])
  })

  // A-06 (fixed): offsets index the original string, also for decomposed (NFD) text.
  test('tokenize: offsets stay valid for NFD text (é = e + U+0301) [BUG A-06]', () => {
    const text = 'Está bem, café.'.normalize('NFD')
    const toks = tokenize(text)
    expect(toks.map((t) => text.slice(t.start, t.end).normalize('NFC'))).toEqual(['Está', 'bem', 'café'])
    expect(toks.map((t) => t.text)).toEqual(['Está', 'bem', 'café']) // token text itself is NFC
    expect(toks.map((t) => t.norm)).toEqual(['está', 'bem', 'café'])
  })

  test('tokenize: NFD offsets after an earlier composed character and with curly apostrophes', () => {
    const text = 'Não há copo d’água à mão.'.normalize('NFD')
    const toks = tokenize(text)
    expect(toks.map((t) => text.slice(t.start, t.end).normalize('NFC'))).toEqual(['Não', 'há', 'copo', 'd’água', 'à', 'mão'])
    expect(toks.find((t) => t.norm.startsWith('d'))?.text).toBe("d'água")
  })
})

// ─── conjugation: extra reference paradigms (pt-PT) ──────────────────────────

const row = (lemma: string, t: Tense) => conjugate(lemma)!.tenses[t].map((c) => c.join('/') || '-').join(' ')

describe('conjugate: reference tables', () => {
  test.each([
    ['estar', 'PI', 'estou estás está estamos estais estão'],
    ['estar', 'PPS', 'estive estiveste esteve estivemos estivestes estiveram'],
    ['estar', 'PC', 'esteja estejas esteja estejamos estejais estejam'],
    ['estar', 'IMP', '- está esteja estejamos estai estejam'],
    ['poder', 'PI', 'posso podes pode podemos podeis podem'],
    ['poder', 'PC', 'possa possas possa possamos possais possam'],
    ['querer', 'PI', 'quero queres quer queremos quereis querem'],
    ['querer', 'PC', 'queira queiras queira queiramos queirais queiram'],
    ['saber', 'PI', 'sei sabes sabe sabemos sabeis sabem'],
    ['saber', 'PPS', 'soube soubeste soube soubemos soubestes souberam'],
    ['trazer', 'PI', 'trago trazes traz trazemos trazeis trazem'],
    ['trazer', 'PPS', 'trouxe trouxeste trouxe trouxemos trouxestes trouxeram'],
    ['trazer', 'CD', 'traria trarias traria traríamos traríeis trariam'],
    ['caber', 'PI', 'caibo cabes cabe cabemos cabeis cabem'],
    ['compor', 'PPS', 'compus compuseste compôs compusemos compusestes compuseram'],
    ['desfazer', 'PI', 'desfaço desfazes desfaz desfazemos desfazeis desfazem'],
    ['satisfazer', 'FI', 'satisfarei satisfarás satisfará satisfaremos satisfareis satisfarão'],
    ['conter', 'PI', 'contenho conténs contém contemos contendes contêm'],
    ['intervir', 'PPS', 'intervim intervieste interveio interviemos interviestes intervieram'],
    ['prever', 'PI', 'prevejo prevês prevê prevemos prevedes preveem'],
    ['prever', 'PPS', 'previ previste previu previmos previstes previram'],
    ['requerer', 'PI', 'requeiro requeres requer requeremos requereis requerem'],
    ['requerer', 'PPS', 'requeri requereste requereu requeremos requerestes requereram'],
    ['prover', 'PPS', 'provi proveste proveu provemos provestes proveram'],
    ['vestir', 'PI', 'visto vestes veste vestimos vestis vestem'],
    ['servir', 'PC', 'sirva sirvas sirva sirvamos sirvais sirvam'],
    ['cobrir', 'PI', 'cubro cobres cobre cobrimos cobris cobrem'],
    ['tossir', 'PI', 'tusso tosses tosse tossimos tossis tossem'],
    ['engolir', 'PI', 'engulo engoles engole engolimos engolis engolem'],
    ['cuspir', 'PI', 'cuspo cospes cospe cuspimos cuspis cospem'],
    ['magoar', 'PI', 'magoo magoas magoa magoamos magoais magoam'],
    ['averiguar', 'PPS', 'averiguei averiguaste averiguou averiguámos averiguastes averiguaram'],
    ['doer', 'PI', 'doo dóis dói doemos doeis doem'],
    ['atribuir', 'PI', 'atribuo atribuis atribui atribuímos atribuís atribuem'],
    ['impedir', 'PI', 'impeço impedes impede impedimos impedis impedem'],
    ['maldizer', 'PPS', 'maldisse maldisseste maldisse maldissemos maldissestes maldisseram'],
    ['abster-se', 'PI', 'abstenho absténs abstém abstemos abstendes abstêm'],
  ] as const)('%s %s', (lemma, t, expected) => {
    expect(row(lemma, t)).toBe(expected)
  })

  test.each([
    ['abrir', ['aberto']],
    ['escrever', ['escrito']],
    ['descobrir', ['descoberto']],
    ['aceitar', ['aceitado', 'aceite']],
    ['entregar', ['entregado', 'entregue']],
    ['ganhar', ['ganho']],
    ['gastar', ['gasto']],
    ['morrer', ['morrido', 'morto']],
    ['maldizer', ['maldito']],
    ['desfazer', ['desfeito']],
    ['compor', ['composto']],
    ['prever', ['previsto']],
  ])('participle %s → %j', (lemma, pp) => {
    expect(conjugate(lemma)!.participle).toEqual(pp)
  })

  test('the lexicon entry\'s conj routes a family member (reler → ler)', () => {
    const conj = bundle.conj?.[String(lex.entryById('reler#verb')!.index)]
    expect(conj).toBe('ler')
    const p = conjugate('reler', conj)!
    expect(slot(p, 'PI', 0)).toBe('releio')
    expect(slot(p, 'PC', 0)).toBe('releia')
  })

  test('non-infinitives and junk → null; case / -se / whitespace tolerated', () => {
    for (const x of ['', 'casa', 'falo', 'xyz', 'r', '-se']) expect(conjugate(x), x).toBeNull()
    expect(slot(conjugate('  Falar-se ')!, 'PI', 0)).toBe('falo')
    expect(verbForms('casa')).toBeNull()
    expect(verbClass('falar')).toBe('ar')
    expect(verbClass('pôr')).toBe('er')
    expect(verbClass('casa')).toBeNull()
    expect(typeof verbKind('passear')).toBe('string')
  })

  test('conj «reg» forces the regular table', () => {
    expect(slot(conjugate('fazer', 'reg')!, 'PI', 0)).toBe('fazo')
  })

  test('isValidConj', () => {
    expect(isValidConj('ser')).toBe(true)
    expect(isValidConj('reg')).toBe(true)
    expect(isValidConj('nonsense')).toBe(false)
  })

  test('verbForms tags: one form in several slots, participle agreement', () => {
    const f = verbForms('falar')!
    expect(f.get('fale')).toEqual(['PC1s', 'PC3s', 'IMP3s'])
    expect(f.get('faladas')).toEqual(['PPFPL'])
    expect(verbForms('aceitar')!.get('aceites')).toEqual(['PC2s', 'PPPL'])
  })
})

// ─── morph & guess ───────────────────────────────────────────────────────────

describe('morph', () => {
  test('parseTags: empty, known, unknown', () => {
    expect(parseTags('')).toEqual([])
    expect(parseTags('PPS1p,ZZZ')).toEqual([{ code: 'PPS1p', tense: 'PPS', person: '1p' }, { code: 'ZZZ' }])
  })

  test('isVerbTag', () => {
    expect(isVerbTag('PI1s')).toBe(true)
    expect(isVerbTag('GER')).toBe(true)
    expect(isVerbTag('PPFPL')).toBe(true)
    expect(isVerbTag('PL')).toBe(false)
    expect(isVerbTag('')).toBe(false)
    expect(isVerbTag('X')).toBe(false)
  })

  test('morphLabel groups persons per tense in canonical order; imperative uses você', () => {
    const l = morphLabel('IMP3s,PC3s,PC1s')
    expect(l.indexOf('eu')).toBeGreaterThan(-1)
    expect(l).toContain('você')
    expect(l.split('; ')).toHaveLength(2)
    expect(morphLabel('')).toBe('')
    expect(morphLabel('ZZZ')).toBe('')
    expect(morphLabel('PL,PL')).toBe(morphLabel('PL'))
  })

  test('morphHint dedupes and skips unknown codes', () => {
    expect(morphHint('PI1s,PI1s')).toBe(morphHint('PI1s'))
    expect(morphHint('ZZZ')).toBe('')
    expect(morphHint('GER')).not.toBe('')
  })
})

describe('guessLemmas', () => {
  test('empty / short / non-words → nothing sensible, no throw', () => {
    expect(guessLemmas('')).toEqual([])
    expect(() => guessLemmas('a')).not.toThrow()
    expect(guessLemmas('😀')).toEqual([])
  })

  test('regular future 1p → -ar/-er/-ir candidates', () => {
    const g = guessLemmas('cantaremos')
    expect(g.some((x) => x.lemma === 'cantar' && x.pos === 'verb')).toBe(true)
  })

  test('a lemma reached through several endings merges its tags (no duplicate guesses)', () => {
    for (const form of ['falasse', 'cantam', 'comeram', 'partiram', 'abria']) {
      const keys = guessLemmas(form).map((x) => `${x.lemma}|${x.pos}`)
      expect(new Set(keys).size, form).toBe(keys.length)
    }
  })

  test('plural -ões → -ão nominal guess', () => {
    expect(guessLemmas('canções').some((x) => x.lemma === 'canção' && x.pos === 'nominal')).toBe(true)
  })
})
