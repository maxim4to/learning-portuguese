/**
 * Workstream B · words: a small dictionary in every status (NOW = 2026-10-19 12:00 UTC).
 *
 *   saúde   new       (fresh PT→RU card)              A2, vocab «Здоровье и медицина», newest
 *   pão     learning  (reviewed, due yesterday)       A2, situation «В поликлинике»
 *   chávena learning  (reviewed, due in 3 days)       A2, reading text, with a sentence
 *   fixe    known     (mark: known, no cards)         A2, manual
 *   xyzzq   paused    (all cards suspended)           no level, no lexicon id, tutor import
 */
import type { WordCardMode } from '../../src/data/types'
import { DAY, NOW, fsrs, fsrsNew, word, wordCard, type Seed } from '../fixtures/seed'

/** As saved by the app (all modes allowed; the seed builder defaults to recognize only). */
const ALL: WordCardMode[] = ['recognize', 'produce', 'cloze', 'listen']

export const saude = word('saúde', 'здоровье', {
  lexId: 'saúde#noun',
  pos: 'noun',
  gender: 'f',
  level: 'A2',
  sources: [{ src: 'vocab:saude', form: 'saúde', at: NOW - DAY }],
  createdAt: NOW - DAY,
  modes: ALL,
})
export const pao = word('pão', 'хлеб', {
  lexId: 'pão#noun',
  pos: 'noun',
  gender: 'm',
  level: 'A2',
  sources: [{ src: 'situation:centro-de-saude:dialogue:2', form: 'pão', at: NOW - 2 * DAY, sentence: 'Quero pão.', sentenceRu: 'Хочу хлеба.' }],
  createdAt: NOW - 2 * DAY,
  modes: ALL,
})
export const chavena = word('chávena', 'чашка', {
  lexId: 'chávena#noun',
  pos: 'noun',
  gender: 'f',
  level: 'A2',
  sources: [{ src: 'reading:a2-a-minha-rotina:paragraph:1', form: 'chávena', at: NOW - 3 * DAY, sentence: 'Bebo uma chávena de café.' }],
  createdAt: NOW - 3 * DAY,
  modes: ALL,
})
export const fixe = word('fixe', 'классный', {
  lexId: 'fixe#adj',
  pos: 'adj',
  level: 'A2',
  mark: 'known',
  sources: [{ src: 'manual', form: 'fixe', at: NOW - 4 * DAY }],
  createdAt: NOW - 4 * DAY,
  modes: ALL,
})
export const xyzzq = word('xyzzq', 'штука', {
  sources: [{ src: 'manual:tutor', form: 'xyzzq', at: NOW - 5 * DAY }],
  createdAt: NOW - 5 * DAY,
  modes: ALL,
})

export function dictionarySeed(extra: Partial<Seed> = {}): Seed {
  return {
    words: [saude, pao, chavena, fixe, xyzzq],
    cards: [
      wordCard(saude, 'recognize', { fsrs: fsrsNew() }),
      wordCard(pao, 'recognize', { fsrs: fsrs({ due: NOW - DAY, stability: 2 }) }),
      wordCard(chavena, 'recognize', { fsrs: fsrs({ due: NOW + 3 * DAY, stability: 6, lapses: 1 }) }),
      wordCard(xyzzq, 'recognize', { suspended: true, fsrs: fsrs({ due: NOW + DAY }) }),
    ],
    ...extra,
  }
}
