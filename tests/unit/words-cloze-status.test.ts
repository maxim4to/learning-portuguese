/**
 * src/features/words/{cloze,status}.ts — adversarial masking (unicode, NFC/NFD, regex metacharacters, word boundaries
 * with accented letters, contractions), segment splitting, accepted answers; status and mode-unlock branches.
 */
import { describe, expect, test } from 'vitest'
import type { SrsCard } from '@/data/types.ts'
import { NOW, card, fsrs, fsrsNew, word, wordCard } from '../fixtures/seed.ts'
import { GAP, clozeAnswers, clozeSource, maskForm, splitByMask, wordAnswers } from '@/features/words/cloze'
import {
  KNOWN_STABILITY_DAYS,
  LATE_UNLOCK_STABILITY_DAYS,
  MODE_UNLOCK_HINT,
  WORD_MODE_LABEL,
  WORD_STATUS_LABEL,
  cardsOfWord,
  countByStatus,
  groupCardsByWord,
  modeStates,
  readyModes,
  unlockConditionMet,
  wordStatus,
} from '@/features/words/status'

const nfd = (s: string) => s.normalize('NFD')

describe('maskForm', () => {
  test('blank form: sentence unchanged', () => {
    expect(maskForm('Uma casa.', '')).toBe('Uma casa.')
    expect(maskForm('Uma casa.', '   ')).toBe('Uma casa.')
  })

  test('NFC/NFD in either argument', () => {
    expect(maskForm(nfd('A saúde é tudo.'), 'saúde')).toBe(`A ${GAP} é tudo.`)
    expect(maskForm('A saúde é tudo.', nfd('saúde'))).toBe(`A ${GAP} é tudo.`)
    expect(maskForm(nfd('Não, não!'), nfd('não'))).toBe(`${GAP}, ${GAP}!`)
  })

  test('case-insensitive for accented capitals', () => {
    expect(maskForm('ÁGUA e água', 'água')).toBe(`${GAP} e ${GAP}`)
    expect(maskForm('É verdade', 'é')).toBe(`${GAP} verdade`)
    expect(maskForm('CORAÇÃO', 'coração')).toBe(GAP)
  })

  test('word boundaries respect accented letters and digits', () => {
    expect(maskForm('O café é bom.', 'é')).toBe(`O café ${GAP} bom.`)
    expect(maskForm('Vou à praia, a pé.', 'a')).toBe(`Vou à praia, ${GAP} pé.`)
    expect(maskForm('Vou à praia.', 'à')).toBe(`Vou ${GAP} praia.`)
    expect(maskForm('casa1 casa 2casa', 'casa')).toBe(`casa1 ${GAP} 2casa`)
    expect(maskForm('ação reação', 'ação')).toBe(`${GAP} reação`)
  })

  test('contractions are whole words: «do» does not hit «todo», «dó», «doce»', () => {
    expect(maskForm('Todo o dó do doce.', 'do')).toBe(`Todo o dó ${GAP} doce.`)
    expect(maskForm('No banco, na rua, pelo parque.', 'no')).toBe(`${GAP} banco, na rua, pelo parque.`)
    expect(maskForm('pelo pelos pela', 'pelo')).toBe(`${GAP} pelos pela`)
  })

  test('overlapping candidates: only standalone occurrences', () => {
    expect(maskForm('aaa aa a aa', 'aa')).toBe(`aaa ${GAP} a ${GAP}`)
  })

  test('regex metacharacters in the form are literal', () => {
    expect(maskForm('a.b axb', 'a.b')).toBe(`${GAP} axb`)
    expect(maskForm('(sic) sic', '(sic)')).toBe(`${GAP} sic`)
    expect(maskForm('custa 5$ ou $ hoje', '$')).toBe(`custa 5$ ou ${GAP} hoje`)
    expect(maskForm('x+y = x+y', 'x+y')).toBe(`${GAP} = ${GAP}`)
  })

  test('replacement text is literal even when the sentence has $ patterns', () => {
    expect(maskForm("custa $& e $1 e $' casa", 'casa')).toBe(`custa $& e $1 e $' ${GAP}`)
  })

  test('typography: spaces (incl. NBSP), hyphens and apostrophes in the form are tolerant', () => {
    expect(maskForm('Na casa de   banho.', 'casa de banho')).toBe(`Na ${GAP}.`)
    expect(maskForm('Levanto–me já.', 'levanto-me')).toBe(`${GAP} já.`)
    expect(maskForm("Um copo d'água.", 'd’água')).toBe(`Um copo ${GAP}.`)
    expect(maskForm('  saúde  ', ' saúde ')).toBe(`  ${GAP}  `)
  })

  test('clitic forms: the clitic of another verb is untouched', () => {
    expect(maskForm('Lava-se e levanta-se.', 'levanta-se')).toBe(`Lava-se e ${GAP}.`)
    expect(maskForm('Diz-lhe que sim.', 'lhe')).toBe(`Diz-${GAP} que sim.`)
  })
})

describe('splitByMask', () => {
  test('unicode sentence in NFD: segments are NFC and cover the whole sentence', () => {
    const s = nfd('Não sei, não.')
    const parts = splitByMask(s, maskForm(s, 'não'))
    expect(parts).toEqual([{ text: 'Não', form: true }, { text: ' sei, ' }, { text: 'não', form: true }, { text: '.' }])
    expect(parts.map((p) => p.text).join('')).toBe(s.normalize('NFC'))
  })

  test('form at the very end / the whole sentence', () => {
    expect(splitByMask('Olá', GAP)).toEqual([{ text: 'Olá', form: true }])
    expect(splitByMask('Diz olá', `Diz ${GAP}`)).toEqual([{ text: 'Diz ' }, { text: 'olá', form: true }])
  })

  // BUG A-21: see docs/testing-bugs/A.md — a multi-word form repeated with only a space between the occurrences:
  // the first highlighted segment stops at the first space inside the form.
  test.fails('multi-word form repeated back to back is highlighted whole', () => {
    const s = 'bom dia bom dia'
    expect(splitByMask(s, maskForm(s, 'bom dia'))).toEqual([{ text: 'bom dia', form: true }, { text: ' ' }, { text: 'bom dia', form: true }])
  })
})

describe('clozeSource', () => {
  test('blank / missing form falls back to the lemma; blank lemma and form → none', () => {
    const at = NOW
    expect(clozeSource({ lemma: 'casa', sources: [{ src: 's', form: '  ', at, sentence: 'A casa.' }] })?.form).toBe('casa')
    expect(clozeSource({ lemma: 'casa', sources: [{ src: 's', form: undefined as unknown as string, at, sentence: 'A casa.' }] })?.form).toBe('casa')
    expect(clozeSource({ lemma: ' ', sources: [{ src: 's', form: '', at, sentence: 'A casa.' }] })).toBeUndefined()
  })

  test('NFD sentence is found and masked; trimmed form is reported', () => {
    const r = clozeSource({ lemma: 'saúde', sources: [{ src: 's', form: ' saúde ', at: NOW, sentence: nfd('  A saúde primeiro.  ') }] })
    expect(r).toMatchObject({ form: 'saúde', masked: `A ${GAP} primeiro.` })
  })
})

describe('clozeAnswers / wordAnswers', () => {
  test('noun: capitalised form still gets the article variants; inflected or articled form does not', () => {
    expect(clozeAnswers({ lemma: 'saúde', pos: 'noun', gender: 'f' }, 'Saúde')).toEqual(['Saúde', 'a Saúde'])
    expect(clozeAnswers({ lemma: 'utente', gender: 'mf' }, 'utente')).toEqual(['utente', 'o utente', 'a utente'])
    expect(clozeAnswers({ lemma: 'saúde', pos: 'noun', gender: 'f' }, 'a saúde')).toEqual(['a saúde'])
    expect(clozeAnswers({ lemma: 'saúde', pos: 'noun' }, 'saúde')).toEqual(['saúde'])
    expect(clozeAnswers({ lemma: 'bom', pos: 'adj', gender: 'm' }, 'bom')).toEqual(['bom'])
  })

  test('typed word: trims, optional article both ways, no duplicates', () => {
    expect(wordAnswers({ lemma: '  pão ', pos: 'noun', gender: 'm' })).toEqual(['pão', 'o pão'])
    expect(wordAnswers({ lemma: 'a saúde', pos: 'noun', gender: 'f' })).toEqual(['a saúde', 'saúde'])
    expect(wordAnswers({ lemma: 'os óculos' })).toEqual(['os óculos', 'óculos'])
    expect(wordAnswers({ lemma: 'correr', pos: 'verb' })).toEqual(['correr'])
  })
})

describe('status', () => {
  const w = word('x', 'y', { modes: ['recognize', 'produce', 'cloze', 'listen'] })
  const rev = (mode: SrsCard['mode'], stability: number, patch: Partial<SrsCard> = {}) => wordCard(w, mode, { fsrs: fsrs({ state: 2, stability }), ...patch })

  test('labels and hints cover every status / mode', () => {
    expect(Object.keys(WORD_STATUS_LABEL)).toEqual(['new', 'learning', 'known', 'paused'])
    for (const m of ['recognize', 'produce', 'cloze', 'listen'] as const) {
      expect(WORD_MODE_LABEL[m]).toBeTruthy()
      expect(MODE_UNLOCK_HINT[m]).toBeTruthy()
    }
    expect(MODE_UNLOCK_HINT.cloze).toContain(String(LATE_UNLOCK_STABILITY_DAYS))
  })

  test('wordStatus thresholds and suspended mixes', () => {
    expect(wordStatus({}, [rev('recognize', KNOWN_STABILITY_DAYS), rev('produce', KNOWN_STABILITY_DAYS)])).toBe('known')
    expect(wordStatus({}, [rev('recognize', KNOWN_STABILITY_DAYS - 0.01), rev('produce', 99)])).toBe('learning')
    // one mode only: never automatically known
    expect(wordStatus({}, [rev('recognize', 99)])).toBe('learning')
    // a suspended mode still counts as «created», the active one decides
    expect(wordStatus({}, [rev('recognize', 30), rev('produce', 1, { suspended: true })])).toBe('known')
    // Relearning (state 3) with high stability is not known
    expect(wordStatus({}, [rev('recognize', 30), wordCard(w, 'produce', { fsrs: fsrs({ state: 3, stability: 30 }) })])).toBe('learning')
    // a new card next to suspended ones: still new
    expect(wordStatus({}, [wordCard(w, 'recognize', { fsrs: fsrsNew() }), rev('produce', 5, { suspended: true })])).toBe('new')
    expect(wordStatus({ mark: 'known' }, [])).toBe('known')
    expect(wordStatus({}, [])).toBe('new')
  })

  test('countByStatus / groupCardsByWord / cardsOfWord', () => {
    expect(countByStatus([])).toEqual({ new: 0, learning: 0, known: 0, paused: 0 })
    expect(countByStatus(['new', 'new', 'paused'])).toEqual({ new: 2, learning: 0, known: 0, paused: 1 })
    const other = word('z', 'z')
    const cards = [wordCard(w), wordCard(other), card('ph:1'), wordCard(w, 'produce')]
    const g = groupCardsByWord(cards)
    expect([...g.keys()]).toEqual(['u:x', 'u:z'])
    expect(g.get('u:x')!.map((c) => c.mode)).toEqual(['recognize', 'produce'])
    expect(cardsOfWord('u:z', cards)).toHaveLength(1)
  })

  test('unlockConditionMet: all branches', () => {
    const r = (patch: Partial<SrsCard['fsrs']>) => wordCard(w, 'recognize', { fsrs: { ...fsrsNew(), ...patch } })
    expect(unlockConditionMet('recognize', undefined)).toBe(true)
    expect(unlockConditionMet('produce', undefined, 'easy')).toBe(false)
    expect(unlockConditionMet('produce', r({}), 'good')).toBe(true)
    expect(unlockConditionMet('produce', r({}), 'easy')).toBe(true)
    expect(unlockConditionMet('produce', r({}), 'hard')).toBe(false)
    expect(unlockConditionMet('produce', r({ state: 1, learning_steps: 0 }))).toBe(false)
    expect(unlockConditionMet('produce', r({ state: 1, learning_steps: 1 }))).toBe(true)
    expect(unlockConditionMet('produce', r({ state: 3 }))).toBe(true)
    expect(unlockConditionMet('cloze', r({ state: 2, stability: LATE_UNLOCK_STABILITY_DAYS }))).toBe(true)
    expect(unlockConditionMet('listen', r({ state: 2, stability: LATE_UNLOCK_STABILITY_DAYS - 0.5 }))).toBe(false)
    expect(unlockConditionMet('listen', r({ state: 3, stability: 10 }))).toBe(true)
    expect(unlockConditionMet('listen', r({ state: 1, stability: 10 }))).toBe(false)
  })

  test('modeStates: disabled / unavailable / ready / locked / active', () => {
    const e = { ...w, sources: [{ src: 's', form: 'x', at: NOW, sentence: 'Um x aqui.' }] }
    const recognize = rev('recognize', 10)
    expect(modeStates(e, [recognize])).toEqual({ recognize: 'active', produce: 'ready', cloze: 'ready', listen: 'ready' })
    expect(modeStates(e, [recognize], { canListen: false, enabledModes: ['recognize', 'produce', 'listen'] })).toEqual({
      recognize: 'active',
      produce: 'ready',
      cloze: 'disabled',
      listen: 'unavailable',
    })
    expect(modeStates({ ...e, sources: [] }, [recognize]).cloze).toBe('unavailable')
    expect(modeStates({ ...e, modes: ['recognize'] }, [recognize]).produce).toBe('disabled')
    expect(modeStates({ ...e, mark: 'known' }, [recognize]).produce).toBe('disabled')
    expect(modeStates(e, [])).toEqual({ recognize: 'ready', produce: 'locked', cloze: 'locked', listen: 'locked' })
    // a known word's existing cards are still «active»
    expect(modeStates({ ...e, mark: 'known' }, [recognize]).recognize).toBe('active')
    expect(readyModes(e, [rev('recognize', 1)], { rating: 'good' })).toEqual(['produce'])
  })
})
