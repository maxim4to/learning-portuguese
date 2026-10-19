/**
 * Personal dictionary unit tests (pure functions):
 *   npx tsx --test scripts/words.test.ts
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { parseExportBundle, type ExportBundle, type SrsCard, type WordEntry } from '../src/data/types.ts'
import { schedule } from '../src/engine/fsrs.ts'
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
