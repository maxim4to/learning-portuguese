/**
 * features/exercises/grade.ts — gradeTyped (the grader behind every typed kind: fill-gap, transform,
 * translate-ru-pt, listen-type, order-words) plus the verdict rules of the non-typed kinds as the components
 * apply them (choice / listen-choice: index; match: all pairs; speak-shadow: self-graded) via describe/feedbackText.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gradeTyped, shuffle } from '@/features/exercises/grade'
import { exerciseExpected } from '@/features/exercises/describe'
import { ex } from '../helpers/A-feat-fixtures'

const v = (given: string, accepted: string[]) => gradeTyped(given, accepted).verdict

describe('gradeTyped: exact, case, whitespace, punctuation', () => {
  it('exact match → correct, expected is the original accepted spelling, given kept verbatim', () => {
    expect(gradeTyped('  Estou   cansado ', ['Estou cansado.'])).toEqual({ given: '  Estou   cansado ', verdict: 'correct', expected: 'Estou cansado.' })
  })
  it.each([
    ['ESTOU CANSADO', 'Estou cansado.'],
    ['estou cansado!!!', 'Estou cansado.'],
    ['¿Estás bem?', 'Estás bem?'],
    ['«Bom dia», disse ele', '"Bom dia", disse ele.'],
    ['Sim sou', 'Sim, sou.'],
    ['\tSim,\n sou ', 'Sim, sou.'],
    ['Olá… tudo bem', 'Olá, tudo bem?'],
    ['ESTÁ', 'está'],
    ['À tarde', 'à tarde'],
  ])('%j ≡ %j', (given, acc) => {
    expect(v(given, [acc])).toBe('correct')
  })
  it('NFD input (combining accents) equals NFC answers', () => {
    expect(v('está aqui', ['está aqui'])).toBe('correct')
    expect(v('coração', ['coração'])).toBe('correct')
  })
})

describe('gradeTyped: apostrophes and hyphens', () => {
  it.each(["d'água", 'd’água', 'd‘água', 'd`água', 'd´água', 'dʼágua'])('apostrophe variant %j is accepted', (given) => {
    expect(v(`copo ${given}`, ["copo d'água"])).toBe('correct')
  })
  it('clitic hyphen: spacing and dash variants around it are unified', () => {
    expect(v('Chama - se Ana', ['Chama-se Ana.'])).toBe('correct')
    expect(v('Chama‑se Ana', ['Chama-se Ana.'])).toBe('correct') // non-breaking hyphen
    expect(v('Chama–se Ana', ['Chama-se Ana.'])).toBe('correct') // en dash
  })
  it('missing hyphen is a real mistake (wrong, not accents)', () => {
    expect(v('Chama se Ana', ['Chama-se Ana.'])).toBe('wrong')
    expect(v('Chamase Ana', ['Chama-se Ana.'])).toBe('wrong')
  })
  // BUG A-14: see docs/testing-bugs/A.md — a spaced dash used as punctuation glues the neighbouring words.
  it.fails('a spaced dash used as a pause (instead of a comma) is sentence punctuation, not a hyphen', () => {
    expect(v('Olá — tudo bem?', ['Olá, tudo bem?'])).toBe('correct')
  })
})

describe('gradeTyped: soft accents', () => {
  it.each([
    ['esta cansado', 'Está cansado.'],
    ['comecar', 'começar'],
    ['cafe', 'café'],
    ['nao', 'não'],
    ['a tarde', 'à tarde'],
    ['avo', 'avó'],
    ['ESTA', 'está'],
    ['está', 'esta'], // extra accent is also accent-only
  ])('%j vs %j → accents, expected shows the accented answer', (given, acc) => {
    const r = gradeTyped(given, [acc])
    expect(r.verdict).toBe('accents')
    expect(r.expected).toBe(acc)
  })
  it('accent error + another typo → wrong', () => {
    expect(v('esta cansadu', ['Está cansado.'])).toBe('wrong')
  })
  it('exact match on one variant wins over an accent-only match on an earlier one', () => {
    expect(gradeTyped('avo', ['avó', 'avo'])).toMatchObject({ verdict: 'correct', expected: 'avo' })
  })
})

describe('gradeTyped: alternative answers', () => {
  const acc = ['Estou cansado.', 'Estou cansada.', 'Sinto-me cansado.']
  it('any variant is correct and reported as expected', () => {
    expect(gradeTyped('estou cansada', acc)).toMatchObject({ verdict: 'correct', expected: 'Estou cansada.' })
    expect(gradeTyped('Sinto-me cansado', acc)).toMatchObject({ verdict: 'correct', expected: 'Sinto-me cansado.' })
  })
  it('wrong → expected is the closest variant (by edit distance), ties → first', () => {
    expect(gradeTyped('Sinto me cansado', acc).expected).toBe('Sinto-me cansado.')
    expect(gradeTyped('Estou cansadx', acc).expected).toBe('Estou cansado.')
    expect(gradeTyped('', acc)).toMatchObject({ verdict: 'wrong', expected: 'Estou cansado.' })
    expect(gradeTyped('...', acc)).toMatchObject({ verdict: 'wrong' })
  })
  it('accent-only hit on a later variant is preferred to a closer-looking wrong one', () => {
    expect(gradeTyped('voce esta', ['Tu estás', 'Você está'])).toMatchObject({ verdict: 'accents', expected: 'Você está' })
  })
  it('an empty accepted list is a programming error', () => {
    expect(() => gradeTyped('x', [])).toThrow(/accepted list is empty/)
  })
})

describe('gradeTyped: multiple gaps (fields joined with " / ")', () => {
  const acc = ['sou / estou']
  it.each(['sou / estou', 'sou/estou', 'sou  /estou', ' Sou / Estou. '])('%j → correct', (given) => {
    expect(v(given, acc)).toBe('correct')
  })
  it('accepted written without spaces is unified too and reported verbatim', () => {
    expect(gradeTyped('sou / estou', ['sou/estou'])).toEqual({ given: 'sou / estou', verdict: 'correct', expected: 'sou/estou' })
  })
  it('order matters; one wrong gap → wrong; one accent slip → accents', () => {
    expect(v('estou / sou', acc)).toBe('wrong')
    expect(v('sou / esta', ['sou / está'])).toBe('accents')
    expect(v(' / estou', acc)).toBe('wrong')
  })
  it('three gaps with punctuation inside a field', () => {
    expect(v('o, / a. / os', ['o / a / os'])).toBe('correct')
  })
})

describe('gradeTyped per typed exercise kind (answers from the exercise)', () => {
  it('fill-gap / transform / translate-ru-pt / listen-type use ex.answer; order-words uses [ex.answer]', () => {
    expect(v('SOU', ex.fillGap().answer)).toBe('correct')
    expect(v('os carros', ex.transform().answer)).toBe('correct')
    expect(v('Estou cansada', ex.translate().answer)).toBe('correct')
    expect(v('bom dia', ex.listenType().answer)).toBe('correct')
    // order-words: chips joined by spaces; punctuation chips and clitic chips are normalised.
    expect(v('Eu sou professor', [ex.orderWords().answer])).toBe('correct')
    expect(v('Olá , tudo bem ?', ['Olá, tudo bem?'])).toBe('correct')
    expect(v('Ela chama -se Ana', ['Ela chama-se Ana.'])).toBe('correct')
    expect(v('sou Eu professor', [ex.orderWords().answer])).toBe('wrong')
  })
  it('choice / listen-choice / match / speak-shadow: expected answer shown after grading', () => {
    expect(exerciseExpected(ex.choice())).toEqual(['está'])
    expect(exerciseExpected(ex.listenChoice())).toEqual(['спасибо'])
    expect(exerciseExpected(ex.match())).toEqual(['casa — дом; carro — машина'])
    expect(exerciseExpected(ex.speak())).toEqual(['Muito prazer.'])
  })
})

describe('shuffle', () => {
  afterEach(() => vi.restoreAllMocks())
  it('returns a new permutation without mutating the input', () => {
    const src = [1, 2, 3, 4, 5]
    const out = shuffle(src)
    expect(src).toEqual([1, 2, 3, 4, 5])
    expect(out).not.toBe(src)
    expect([...out].sort()).toEqual(src)
  })
  it('Fisher–Yates with a fixed random source', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(shuffle([1, 2, 3])).toEqual([2, 3, 1])
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    expect(shuffle([1, 2, 3])).toEqual([1, 2, 3])
    expect(shuffle([])).toEqual([])
  })
})
