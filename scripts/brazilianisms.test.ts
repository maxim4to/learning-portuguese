import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lintText } from './brazilianisms.ts'

const flagged = (t: string, needle: string) => lintText(t).some((m) => m.includes(needle))

test('«a gente» as pronoun is flagged', () => {
  for (const t of ['A gente vai ao cinema.', 'Amanhã a gente fala.', 'O João e a gente.', 'Ontem, a gente saiu.']) {
    assert.ok(flagged(t, 'a gente'), t)
  }
})

test('«gente» as a noun is not flagged', () => {
  for (const t of [
    'Toda a gente sabe isso.',
    'TODA A GENTE gosta.',
    'Há muita gente na praia.',
    'Pouca gente veio.',
    'Tanta gente!',
    'Há gente lá fora.',
    'Nenhuma a gente viu.',
    'Conheço boa gente.',
    'Essa a gente não conhece.',
    'Gente simpática.',
  ]) {
    assert.ok(!flagged(t, 'a gente'), t)
  }
})

test('«legal» only in the «cool» sense', () => {
  for (const t of ['Que legal!', 'Isso é legal.', 'Muito legal, obrigado.', 'Legal!']) assert.ok(flagged(t, 'legal'), t)
  for (const t of ['Precisa de assistência legal.', 'A idade legal é 18 anos.', 'Ilegal.', 'Legalmente, sim.']) {
    assert.ok(!flagged(t, 'legal'), t)
  }
})

test('word boundaries: trem / celular', () => {
  assert.ok(flagged('Vou de trem.', 'trem'))
  for (const t of ['O trema caiu em desuso.', 'Foi tremendo.', 'Estou a tremer.']) assert.ok(!flagged(t, 'trem'), t)
  assert.ok(flagged('Perdi o celular.', 'celular'))
  assert.ok(flagged('Dois celulares.', 'celular'))
  assert.ok(!flagged('A célula é pequena.', 'celular'))
  assert.ok(!flagged('Um organismo multicelular.', 'celular'))
})

test('other words', () => {
  assert.ok(flagged('Vou de ônibus.', 'ônibus'))
  assert.ok(flagged('Tomei café da manhã.', 'café da manhã'))
  assert.ok(!flagged('Tomei o pequeno-almoço.', 'café da manhã'))
  assert.ok(flagged('Estou falando.', 'герундий'))
  assert.ok(!flagged('Estou a falar.', 'герундий'))
  assert.ok(!flagged('Está lindo.', 'герундий'))
})
