/**
 * engine/grading.ts: normalize (case, NFC/NFD, apostrophes, quotes, dashes, punctuation, whitespace, clitic hyphens),
 * stripAccents, looseMatch, gradeAnswer verdicts across multiple accepted answers, levenshtein.
 */
import { describe, expect, test } from 'vitest'
import { gradeAnswer, levenshtein, looseMatch, normalize, stripAccents } from '@/engine/grading'

describe('normalize', () => {
  test.each([
    ['  Olá, Mundo!  ', 'olá mundo'],
    ['ESTÁ', 'está'],
    ['Ç', 'ç'],
    ['Eu  sou\t\tde\nLisboa.', 'eu sou de lisboa'],
    ['¿Como? ¡Sim!', 'como sim'],
    ['«Bom dia»', 'bom dia'],
    ['“Bom” dia', 'bom dia'],
    ['Diz: (já) sei; ok…', 'diz já sei ok'],
    ['chama-se', 'chama-se'],
    ['chama - se', 'chama-se'],
    ['chama‑se', 'chama-se'], // non-breaking hyphen
    ['chama–se', 'chama-se'], // en dash
    ['d’água', "d'água"],
    ['d`água', "d'água"],
    ['d´água', "d'água"],
    ['', ''],
    ['   ', ''],
    ['...', ''],
    ['nbsp here', 'nbsp here'],
  ])('%j → %j', (input, out) => {
    expect(normalize(input)).toBe(out)
  })

  test('NFD input equals NFC input', () => {
    const nfd = 'está'.normalize('NFD')
    expect(nfd).not.toBe('está')
    expect(normalize(nfd)).toBe('está')
  })

  test('accents are kept (only stripAccents removes them)', () => {
    expect(normalize('Avó')).not.toBe(normalize('Avô'))
  })
})

describe('stripAccents / looseMatch', () => {
  test.each([
    ['está', 'esta'],
    ['ação', 'acao'],
    ['pôr', 'por'],
    ['à', 'a'],
    ['Ü', 'U'],
  ])('%s → %s', (a, b) => expect(stripAccents(a)).toBe(b))

  test('looseMatch ignores accents, case, punctuation; not letters', () => {
    expect(looseMatch('ESTÁ!', 'esta')).toBe(true)
    expect(looseMatch('avô', 'avó')).toBe(true)
    expect(looseMatch('esta', 'estar')).toBe(false)
  })
})

describe('gradeAnswer', () => {
  test('throws on an empty accepted list', () => {
    expect(() => gradeAnswer('x', [])).toThrow(/empty/)
  })

  test('exact match after normalisation is correct with distance 0, closest = the accepted spelling', () => {
    expect(gradeAnswer('  Sou!  ', ['sou'])).toEqual({ correct: true, closest: 'sou', accentsOnly: false, verdict: 'correct', distance: 0 })
  })

  test('any of several accepted answers counts; closest is the one that matched', () => {
    const r = gradeAnswer('Estou cansada', ['Estou cansado.', 'Estou cansada.'])
    expect(r.verdict).toBe('correct')
    expect(r.closest).toBe('Estou cansada.')
  })

  test('accent-only mismatch → «accents», not correct; distance counts the accent edits', () => {
    const r = gradeAnswer('voce esta', ['Você está'])
    expect(r).toMatchObject({ correct: false, accentsOnly: true, verdict: 'accents', closest: 'Você está', distance: 2 })
  })

  test('wrong accent (grave vs acute) is an accent mismatch', () => {
    expect(gradeAnswer('á', ['à']).verdict).toBe('accents')
  })

  test('accent hit wins over a closer non-accent variant', () => {
    const r = gradeAnswer('pao', ['pão', 'pa'])
    expect(r.verdict).toBe('accents')
    expect(r.closest).toBe('pão')
  })

  test('wrong answer: closest is the nearest accepted variant (first on ties)', () => {
    const r = gradeAnswer('falo', ['falamos', 'fala', 'falei'])
    expect(r).toMatchObject({ correct: false, accentsOnly: false, verdict: 'wrong', closest: 'fala', distance: 1 })
    expect(gradeAnswer('zz', ['ab', 'cd']).closest).toBe('ab')
  })

  test('empty answer is wrong (unless an accepted answer is empty)', () => {
    expect(gradeAnswer('', ['sou']).verdict).toBe('wrong')
    expect(gradeAnswer('   ', ['sou']).distance).toBe(3)
  })

  test('clitic spacing variants are equal, but a missing hyphen is not', () => {
    expect(gradeAnswer('Chama - se', ['chama-se']).verdict).toBe('correct')
    expect(gradeAnswer('chama se', ['chama-se']).verdict).toBe('wrong')
  })

  test('typographic apostrophes and quotes are equivalent', () => {
    expect(gradeAnswer('copo d’água', ["copo d'água"]).verdict).toBe('correct')
  })

  test('uppercase accented input (É) matches', () => {
    expect(gradeAnswer('É ELE', ['é ele']).verdict).toBe('correct')
  })

  test('ç vs c is treated as an accent slip', () => {
    expect(gradeAnswer('acucar', ['açúcar']).verdict).toBe('accents')
  })
})

describe('levenshtein', () => {
  test.each([
    ['', '', 0],
    ['', 'abc', 3],
    ['abc', '', 3],
    ['kitten', 'sitting', 3],
    ['está', 'esta', 1],
    ['😀a', 'a', 1], // by code point, not UTF-16 unit
    ['abc', 'abc', 0],
  ])('%j vs %j = %i', (a, b, d) => {
    expect(levenshtein(a, b)).toBe(d)
    expect(levenshtein(b, a)).toBe(d)
  })
})
