/**
 * Personal dictionary unit tests (pure functions):
 *   npx tsx --test scripts/words.test.ts
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { parseExportBundle, type ExportBundle, type SrsCard, type WordEntry } from '../src/data/types.ts'
import { schedule } from '../src/engine/fsrs.ts'
import { lookupOptions } from '../src/features/words/capture/options.ts'
import {
  hasCyrillic,
  interactiveAncestor,
  isTap,
  lookupModeOf,
  selectionLookupText,
  sentenceAt,
  tokenIndexAt,
  wordAt,
  wordsOf,
  type ElementLike,
} from '../src/features/words/capture/text.ts'
import { tokenize } from '../src/engine/lexicon/normalize.ts'
import { countByStatus, modeStates, readyModes, wordStatus, wordStatuses } from '../src/features/words/status.ts'
import {
  applyWrite,
  buildCards,
  cardFaces,
  invertWrite,
  isLegacyWordCard,
  maskForm,
  parseWordCardId,
  planDeleteWords,
  planLegacyCleanup,
  planMarkKnown,
  planSaveWords,
  planUnmarkKnown,
  planUpdateWord,
  wordCardId,
  wordIdFor,
  wordPt,
  type WordsState,
} from '../src/features/words/wordOps.ts'

const T0 = Date.UTC(2026, 0, 1)
const DAY = 86_400_000

function entry(over: Partial<WordEntry> = {}): WordEntry {
  return {
    id: 'saúde#noun',
    lexId: 'saúde#noun',
    lemma: 'saúde',
    pos: 'noun',
    gender: 'f',
    ru: 'здоровье',
    sources: [],
    modes: ['recognize', 'produce', 'cloze', 'listen'],
    createdAt: T0,
    updatedAt: T0,
    ...over,
  }
}

/** Card with a forced FSRS state. */
function card(e: WordEntry, mode: SrsCard['mode'], fsrs: Partial<SrsCard['fsrs']> = {}, over: Partial<SrsCard> = {}): SrsCard {
  const [c] = buildCards(e, [mode!], [], T0)
  return { ...c, ...over, fsrs: { ...c.fsrs, ...fsrs } }
}

const empty: WordsState = { words: [], cards: [] }

describe('ids', () => {
  test('word id: lexId, else u:<normalized lemma>', () => {
    assert.equal(wordIdFor({ lexId: 'levantar-se#verb', lemma: 'levantar-se' }), 'levantar-se#verb')
    assert.equal(wordIdFor({ lemma: '  Pequeno‑Almoço ' }), 'u:pequeno-almoço')
    assert.equal(wordIdFor({ lemma: 'Saúde' }), wordIdFor({ lemma: 'saúde' }))
  })

  test('card ids are deterministic and parseable', () => {
    assert.equal(wordCardId('levantar-se#verb', 'recognize'), 'lex:levantar-se#verb:recognize')
    assert.deepEqual(parseWordCardId('lex:u:de vez em quando:cloze'), { wordId: 'u:de vez em quando', mode: 'cloze' })
    assert.equal(parseWordCardId('w:saude:3'), undefined)
    assert.equal(parseWordCardId('lex:x:bogus'), undefined)
  })

  test('saving the same word twice yields the same ids', () => {
    const a = planSaveWords(empty, [{ lemma: 'Autocarro', ru: 'автобус' }], { now: T0 })
    const b = planSaveWords(empty, [{ lemma: 'autocarro', ru: 'автобус' }], { now: T0 + 5 })
    assert.equal(a.words[0].id, b.words[0].id)
    assert.deepEqual(a.write.cards!.map((c) => c.id), b.write.cards!.map((c) => c.id))
  })
})

describe('buildCards / faces', () => {
  test('recognize only by default; PT→RU with article for nouns', () => {
    const e = entry()
    const cards = buildCards(e, undefined, [], T0)
    assert.equal(cards.length, 1)
    const [c] = cards
    assert.equal(c.id, 'lex:saúde#noun:recognize')
    assert.equal(c.kind, 'word')
    assert.equal(c.wordId, e.id)
    assert.equal(c.mode, 'recognize')
    assert.equal(c.front, 'a saúde')
    assert.equal(c.back, 'здоровье')
    assert.equal(c.fsrs.state, 0)
    assert.equal(c.createdAt, T0)
  })

  test('skips existing cards and cloze without a sentence', () => {
    const e = entry()
    const existing = buildCards(e, ['recognize'], [], T0)
    const out = buildCards(e, ['recognize', 'produce', 'cloze', 'listen'], existing, T0)
    assert.deepEqual(out.map((c) => c.mode), ['produce', 'listen'])
  })

  test('faces of all modes', () => {
    const e = entry({
      sources: [{ src: 'situation:no-centro:dialogue:2', form: 'saúde', sentence: 'A saúde é o mais importante.', at: T0 }],
    })
    assert.deepEqual(cardFaces(e, 'produce'), { front: 'здоровье (сущ., ж. р.)', back: 'a saúde' })
    assert.deepEqual(cardFaces(e, 'listen'), { front: 'a saúde', back: 'a saúde — здоровье' })
    assert.deepEqual(cardFaces(e, 'cloze'), { front: 'A ___ é o mais importante.', back: 'A saúde é o mais importante.' })
    assert.equal(wordPt({ lemma: 'utente', pos: 'noun', gender: 'mf' }), 'o/a utente')
    assert.equal(wordPt({ lemma: 'levantar-se', pos: 'verb' }), 'levantar-se')
  })

  test('maskForm: whole words, case-insensitive, hyphenated forms', () => {
    assert.equal(maskForm('Levanto-me cedo. levanto-me sempre.', 'levanto-me'), '___ cedo. ___ sempre.')
    assert.equal(maskForm('O casaco da casa', 'casa'), 'O casaco da ___')
  })
})

describe('status lifecycle', () => {
  const e = entry()

  test('new: no cards or no reviewed card', () => {
    assert.equal(wordStatus(e, []), 'new')
    assert.equal(wordStatus(e, [card(e, 'recognize')]), 'new')
  })

  test('learning after the first review', () => {
    const c = schedule(card(e, 'recognize'), 'good', T0 + 1000)
    assert.equal(wordStatus(e, [c]), 'learning')
  })

  test('known: manual mark', () => {
    assert.equal(wordStatus({ ...e, mark: 'known' }, [card(e, 'recognize', {}, { suspended: true })]), 'known')
  })

  test('known automatically: ≥ 2 modes, all in Review with stability ≥ 21 d', () => {
    const strong = { state: 2 as const, stability: 30, reps: 6 }
    const r = card(e, 'recognize', strong)
    const p = card(e, 'produce', strong)
    assert.equal(wordStatus(e, [r]), 'learning', 'one mode is not enough')
    assert.equal(wordStatus(e, [r, p]), 'known')
    assert.equal(wordStatus(e, [r, card(e, 'produce', { state: 2, stability: 10 })]), 'learning')
    // a lapse (Relearning) drops it back to learning
    assert.equal(wordStatus(e, [r, card(e, 'produce', { state: 3, stability: 25, lapses: 1 })]), 'learning')
  })

  test('paused: all cards suspended, no mark', () => {
    assert.equal(wordStatus(e, [card(e, 'recognize', {}, { suspended: true })]), 'paused')
  })

  test('wordStatuses / countByStatus', () => {
    const a = entry({ id: 'a' })
    const b = entry({ id: 'b', mark: 'known' })
    const ca = schedule(buildCards(a, ['recognize'], [], T0)[0], 'good', T0)
    const m = wordStatuses([a, b], [ca])
    assert.equal(m.get('a'), 'learning')
    assert.equal(m.get('b'), 'known')
    assert.deepEqual(countByStatus(m.values()), { new: 0, learning: 1, known: 1, paused: 0 })
  })

  test('staged modes: produce after Review, cloze/listen at stability ≥ 4 d', () => {
    const withSentence = entry({ sources: [{ src: 'manual', form: 'saúde', sentence: 'Boa saúde!', at: T0 }] })
    const fresh = card(withSentence, 'recognize')
    assert.deepEqual(readyModes(withSentence, [fresh]), [])
    const review = card(withSentence, 'recognize', { state: 2, stability: 2 })
    assert.deepEqual(readyModes(withSentence, [review]), ['produce'])
    const stable = card(withSentence, 'recognize', { state: 2, stability: 5 })
    assert.deepEqual(readyModes(withSentence, [stable]), ['produce', 'cloze', 'listen'])
    // settings off / no sentence / no audio
    assert.deepEqual(readyModes(withSentence, [stable], { enabledModes: ['recognize', 'produce'] }), ['produce'])
    const states = modeStates(entry(), [stable], { canListen: false })
    assert.equal(states.recognize, 'active')
    assert.equal(states.cloze, 'unavailable')
    assert.equal(states.listen, 'unavailable')
    assert.equal(modeStates({ ...withSentence, mark: 'known' }, [stable]).produce, 'disabled')
  })
})

describe('planners', () => {
  test('save: new entry + recognize card; merge on re-save keeps meanings, adds source', () => {
    const p1 = planSaveWords(
      empty,
      [{ lexId: 'saúde#noun', lemma: 'saúde', ru: ['здоровье', 'самочувствие'], pos: 'noun', gender: 'f', source: { src: 'vocab:saude', form: 'a saúde' } }],
      { now: T0 },
    )
    assert.equal(p1.words[0].ru, 'здоровье; самочувствие')
    assert.equal(p1.write.cards!.length, 1)
    const s1 = applyWrite(empty, p1.write)
    const p2 = planSaveWords(s1, [{ lexId: 'saúde#noun', lemma: 'saúde', ru: 'другое', source: { src: 'reading:x:paragraph:1', form: 'saúde' } }], { now: T0 + DAY })
    assert.equal(p2.words[0].ru, 'здоровье; самочувствие')
    assert.equal(p2.words[0].sources.length, 2)
    assert.equal(p2.words[0].createdAt, T0)
    assert.equal(p2.write.cards!.length, 0, 'card exists already')
  })

  test('save known: no cards; recognize disabled in settings: no cards', () => {
    assert.equal(planSaveWords(empty, [{ lemma: 'olá', ru: 'привет', mark: 'known' }]).write.cards!.length, 0)
    assert.equal(planSaveWords(empty, [{ lemma: 'olá', ru: 'привет' }], { enabledModes: ['produce'] }).write.cards!.length, 0)
  })

  test('sources capped at 5, newest last, no undefined fields', () => {
    let s = empty
    for (let i = 0; i < 7; i++) {
      s = applyWrite(s, planSaveWords(s, [{ lemma: 'casa', ru: 'дом', source: { src: `reading:r${i}`, form: 'casa' } }], { now: T0 + i }).write)
    }
    const w = s.words[0]
    assert.equal(w.sources.length, 5)
    assert.equal(w.sources.at(-1)!.src, 'reading:r6')
    assert.ok(!Object.values(w).includes(undefined))
  })

  test('update refreshes card faces, keeps FSRS; removing a mode suspends its card', () => {
    const e = entry()
    const r = schedule(buildCards(e, ['recognize'], [], T0)[0], 'good', T0)
    const s: WordsState = { words: [e], cards: [r] }
    const p = planUpdateWord(s, e.id, { ru: 'здоровье ;  health' }, T0 + 1)
    assert.equal(p.words[0].ru, 'здоровье; health')
    assert.equal(p.write.cards![0].back, 'здоровье; health')
    assert.deepEqual(p.write.cards![0].fsrs, r.fsrs)
    const p2 = planUpdateWord(s, e.id, { modes: ['produce'] }, T0 + 1)
    assert.equal(p2.write.cards![0].suspended, true)
    const p3 = planUpdateWord(s, e.id, { note: undefined, gender: undefined }, T0 + 1)
    assert.ok(!('gender' in p3.words[0]))
  })

  test('markKnown suspends; unmarkKnown restores or creates recognize', () => {
    const e = entry()
    const r = buildCards(e, ['recognize'], [], T0)[0]
    const s = applyWrite({ words: [e], cards: [r] }, planMarkKnown({ words: [e], cards: [r] }, e.id, T0).write)
    assert.equal(s.words[0].mark, 'known')
    assert.equal(s.cards[0].suspended, true)
    const s2 = applyWrite(s, planUnmarkKnown(s, e.id, { now: T0 }).write)
    assert.equal(s2.words[0].mark, undefined)
    assert.equal(s2.cards[0].suspended, undefined)
    const known = entry({ mark: 'known' })
    const p = planUnmarkKnown({ words: [known], cards: [] }, known.id, { now: T0 })
    assert.deepEqual(p.write.cards!.map((c) => c.mode), ['recognize'])
  })

  test('delete removes entry and all lex cards; invertWrite undoes', () => {
    const e = entry()
    const r = buildCards(e, ['recognize'], [], T0)[0]
    const other: SrsCard = { ...r, id: 'ph:x:1', wordId: undefined, mode: undefined }
    const s: WordsState = { words: [e], cards: [r, other] }
    const p = planDeleteWords(s, [e.id])
    assert.ok(p.write.deleteCardIds!.includes(r.id))
    assert.ok(p.write.deleteCardIds!.includes(wordCardId(e.id, 'listen')))
    const after = applyWrite(s, p.write)
    assert.deepEqual(after.words, [])
    assert.deepEqual(after.cards.map((c) => c.id), ['ph:x:1'])
    const restored = applyWrite(after, invertWrite(s, p.write))
    assert.deepEqual(restored.words, [e])
    assert.deepEqual(restored.cards.map((c) => c.id).sort(), [r.id, 'ph:x:1'].sort())
  })

  test('undo of a fresh save deletes what it created', () => {
    const p = planSaveWords(empty, [{ lemma: 'mesa', ru: 'стол' }], { now: T0 })
    const inv = invertWrite(empty, p.write)
    assert.deepEqual(inv.deleteWordIds, ['u:mesa'])
    assert.deepEqual(inv.deleteCardIds, ['lex:u:mesa:recognize'])
    assert.deepEqual(applyWrite(applyWrite(empty, p.write), inv), empty)
  })
})

describe('legacy cleanup', () => {
  const base = buildCards(entry(), ['recognize'], [], T0)[0]
  const mk = (id: string, over: Partial<SrsCard> = {}): SrsCard => ({ ...base, id, wordId: undefined, mode: undefined, ...over })

  test('selects w:* and g:* only', () => {
    const cards = [
      mk('w:saude:0'),
      mk('w:no-cafe:3'),
      mk('g:leitura-1:2'),
      mk('ph:no-cafe:1', { kind: 'phrase' }),
      mk('ex:a1-ser:3', { kind: 'grammar' }),
      mk('error:ex1', { kind: 'error' }),
      base, // lex:
    ]
    assert.deepEqual(planLegacyCleanup(cards).deleteCardIds, ['w:saude:0', 'w:no-cafe:3', 'g:leitura-1:2'])
    assert.equal(isLegacyWordCard(base), false)
    assert.equal(isLegacyWordCard(mk('word:x')), false)
  })
})

describe('parseExportBundle', () => {
  const old: ExportBundle = {
    app: 'portugues-pt',
    version: 1,
    exportedAt: T0,
    progress: [],
    cards: [],
    errors: [],
    settings: { voice: 'male', rate: 1, lenientAccents: true, newCardsPerDay: 10 } as ExportBundle['settings'],
  }

  test('old file without words → words: [] and new settings defaults', () => {
    const b = parseExportBundle(JSON.stringify(old))
    assert.deepEqual(b.words, [])
    assert.equal(b.settings.voice, 'male')
    assert.equal(b.settings.lookupOnTap, true)
    assert.deepEqual(b.settings.wordModes, ['recognize', 'produce', 'cloze', 'listen'])
  })

  test('file with words keeps them; invalid entries dropped, defaults filled', () => {
    const e = entry()
    const partial = { id: 'u:mesa', lemma: 'mesa', ru: 'стол', createdAt: T0 } as unknown as WordEntry
    const b = parseExportBundle({ ...old, words: [e, partial, { foo: 1 } as unknown as WordEntry] })
    assert.equal(b.words.length, 2)
    assert.deepEqual(b.words[0], e)
    assert.deepEqual(b.words[1].sources, [])
    assert.deepEqual(b.words[1].modes, ['recognize'])
    assert.equal(b.words[1].updatedAt, T0)
  })

  test('rejects foreign files', () => {
    assert.throws(() => parseExportBundle('{"app":"x","version":1}'))
  })
})

// ─── Word capture (Phase 2): pure hit-test helpers ───────────────────────────────────────

describe('capture: wordAt (Intl.Segmenter + joins)', () => {
  const at = (text: string, i: number) => wordAt(text, i)?.text ?? null
  test('word under the caret, any position inside it', () => {
    const s = 'Bom dia, sente-se. Em que posso ajudá-lo?'
    assert.equal(at(s, 0), 'Bom')
    assert.equal(at(s, 5), 'dia')
    assert.equal(at(s, s.indexOf('posso') + 3), 'posso')
  })
  test('hyphenated clitics and compounds stay one word (from either part)', () => {
    const s = 'Levanto-me cedo e tomo o pequeno-almoço; dir-lhe-ei amanhã.'
    assert.equal(at(s, 2), 'Levanto-me')
    assert.equal(at(s, s.indexOf('me ')), 'Levanto-me')
    assert.equal(at(s, s.indexOf('almoço')), 'pequeno-almoço')
    assert.equal(at(s, s.indexOf('lhe')), 'dir-lhe-ei')
    assert.equal(at('Fá‑lo já.', 1), 'Fá‑lo') // non-breaking hyphen
  })
  test('apostrophe joins (copo d’água)', () => {
    assert.equal(at('um copo d’água fresca', 10), 'd’água')
  })
  test('caret right after a word picks it; spaces, punctuation and numbers give null', () => {
    const s = 'Aqui está. São 5 euros'
    assert.equal(at(s, 4), 'Aqui')
    assert.equal(at(s, s.indexOf('.') + 1), null)
    assert.equal(at(s, s.indexOf('5')), null)
    assert.equal(at('', 0), null)
  })
  test('wordsOf lists the words of a phrase', () => {
    assert.deepEqual(
      wordsOf('Onde é que assino? Aqui em baixo!').map((w) => w.text),
      ['Onde', 'é', 'que', 'assino', 'Aqui', 'em', 'baixo'],
    )
    assert.deepEqual(wordsOf('Sente-se, se faz favor.').map((w) => w.text), ['Sente-se', 'se', 'faz', 'favor'])
  })
})

describe('capture: sentenceAt', () => {
  test('cuts the sentence around the word and maps its position', () => {
    const text = 'Pode. Depois de ativar o cartão, instala a aplicação. Já está!'
    const i = text.indexOf('cartão')
    const s = sentenceAt(text, i, i + 6)
    assert.equal(s.text, 'Depois de ativar o cartão, instala a aplicação.')
    assert.equal(s.text.slice(s.wordStart, s.wordEnd), 'cartão')
    assert.equal(text.slice(i - s.wordStart + 0, i - s.wordStart + s.text.length), s.text)
  })
  test('long sentences become a window ≤ 300 chars with ellipses, word kept', () => {
    const long = Array.from({ length: 120 }, (_, k) => `palavra${k}`).join(' ') + '.'
    const i = long.indexOf('palavra60')
    const s = sentenceAt(long, i, i + 9)
    assert.ok(s.text.length <= 302, String(s.text.length))
    assert.ok(s.text.startsWith('…') && s.text.endsWith('…'))
    assert.equal(s.text.slice(s.wordStart, s.wordEnd), 'palavra60')
  })
})

describe('capture: selection filter (Cyrillic, ≤ 6 words)', () => {
  test('accepts pt words and short phrases, normalises spaces', () => {
    assert.equal(selectionLookupText('  conta à\n ordem '), 'conta à ordem')
    assert.equal(selectionLookupText('levanto-me'), 'levanto-me')
  })
  test('rejects Cyrillic, empty, more than 6 words, very long', () => {
    assert.equal(selectionLookupText('счёт'), null)
    assert.equal(selectionLookupText('conta — счёт'), null)
    assert.equal(selectionLookupText('   '), null)
    assert.equal(selectionLookupText('um dois três quatro cinco seis sete'), null)
    assert.equal(selectionLookupText('a'.repeat(130)), null)
    assert.equal(hasCyrillic('Ёлка'), true)
  })
  test('tap = small move, short press', () => {
    assert.equal(isTap(3, 4, 200), true)
    assert.equal(isTap(8, 0, 100), false)
    assert.equal(isTap(0, 0, 600), false)
  })
})

describe('capture: scope rules (lang, data-lookup, interactive)', () => {
  /** Tiny element stub: el('P', { lang: 'pt-PT' }, parent) */
  const el = (tagName: string, attrs: Record<string, string> = {}, parentElement: ElementLike | null = null): ElementLike => ({
    tagName,
    parentElement,
    getAttribute: (n) => attrs[n] ?? null,
    hasAttribute: (n) => n in attrs,
  })
  const html = el('HTML', { lang: 'ru' })
  const body = el('BODY', {}, html)

  test('pt text → tap; Russian text → none; markdown select container → select', () => {
    const p = el('P', { lang: 'pt-PT' }, body)
    assert.equal(lookupModeOf(el('B', {}, p)), 'tap')
    assert.equal(lookupModeOf(el('P', {}, body)), 'none')
    const md = el('DIV', { 'data-lookup': 'select', 'data-pt-src': 'cheatsheet:x' }, body)
    assert.equal(lookupModeOf(el('LI', {}, md)), 'select')
    assert.equal(lookupModeOf(el('SPAN', { lang: 'pt-PT' }, md)), 'tap')
  })
  test('locked (data-lookup="off") wins over pt and select; "on" re-enables inside', () => {
    const locked = el('DIV', { 'data-lookup': 'off' }, body)
    assert.equal(lookupModeOf(el('P', { lang: 'pt-PT' }, locked)), 'off')
    assert.equal(lookupModeOf(el('DIV', { 'data-lookup': 'select' }, locked)), 'off')
    const open = el('DIV', { 'data-lookup': 'on' }, locked)
    assert.equal(lookupModeOf(el('P', { lang: 'pt-PT' }, open)), 'tap')
    assert.equal(lookupModeOf(el('P', {}, open)), 'none')
  })
  test('the lookup card itself is never a capture area', () => {
    const card = el('DIV', { 'data-lookup-ui': '' }, body)
    assert.equal(lookupModeOf(el('H2', { lang: 'pt-PT' }, card)), 'none')
  })
  test('interactive ancestors are found; plain text and anchors without href are not', () => {
    const p = el('P', { lang: 'pt-PT' }, body)
    assert.equal(interactiveAncestor(el('SPAN', {}, p)), null)
    for (const [tag, attrs] of [
      ['BUTTON', {}],
      ['A', { href: '/x' }],
      ['INPUT', {}],
      ['TEXTAREA', {}],
      ['SELECT', {}],
      ['LABEL', {}],
      ['SUMMARY', {}],
      ['DIV', { role: 'button' }],
      ['DIV', { contenteditable: 'true' }],
    ] as const) {
      const ctl = el(tag, attrs, p)
      assert.equal(interactiveAncestor(el('SPAN', {}, ctl)), ctl, tag)
    }
    assert.equal(interactiveAncestor(el('A', {}, p)), null)
    assert.equal(interactiveAncestor(el('DIV', { contenteditable: 'false' }, p)), null)
  })
})

describe('capture: tokenIndexAt + lookupOptions (expressions first)', () => {
  test('token index of an offset', () => {
    const toks = tokenize('Queria abrir uma conta à ordem')
    assert.equal(tokenIndexAt(toks, 0), 0)
    assert.equal(toks[tokenIndexAt(toks, 'Queria abrir uma co'.length)].text, 'conta')
    assert.equal(tokenIndexAt([], 3), -1)
  })
  test('a short expression around the word goes first, a whole stored sentence after the word', async () => {
    const { createLexicon } = await import('../src/engine/lexicon/lookup.ts')
    const { readFileSync } = await import('node:fs')
    const lex = createLexicon(JSON.parse(readFileSync(new URL('../src/generated/lexicon.json', import.meta.url), 'utf8')))
    const tokens = 'Queria abrir uma conta à ordem , se faz favor'.split(' ').filter((t) => t !== ',')
    const opts = lookupOptions(lex, { form: 'conta', tokens, tokenIndex: 3, multi: false })
    assert.ok(opts.length >= 2)
    assert.equal(opts[0].mwe, true)
    assert.ok(opts[0].entry.lemma.split(' ').length <= 4, opts[0].entry.lemma)
    const word = opts.findIndex((o) => !o.mwe)
    assert.equal(opts[word].entry.lemma, 'conta')
    // multi-word selections resolve as a whole, without expression lookup around
    const sel = lookupOptions(lex, { form: 'se faz favor', multi: true })
    assert.equal(sel[0]?.entry.lemma, 'se faz favor')
  })
})
