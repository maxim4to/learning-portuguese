/**
 * Workstream D seed: a small personal dictionary covering every status.
 *   a saúde     new       (fresh PT→RU card)          vocab:saude, A2
 *   comprar     learning  (PT→RU in Review, due)      situation:banco-conta dialogue line, A1
 *   a janela    known     (mark, no cards)            A1
 *   o pão       paused    (PT→RU suspended)           A2
 *   fixe-ish    own word without lexicon: «xaroposo»  manual, no level
 *   d'água      own word with an apostrophe            manual (import)
 */
import type { SrsCard, WordEntry } from '../../src/data/types.ts'
import { DAY, NOW, type Seed } from './seed'
import { ALL_MODES, dictCard, fsrsNewAt, fsrsReview, lexWord } from '../helpers/d-dict'
import { word } from './seed'

export const saude = lexWord('saúde', 'noun', 'здоровье', {
  gender: 'f',
  level: 'A2',
  sources: [{ src: 'vocab:saude', form: 'a saúde', sentence: 'A saúde está em primeiro lugar.', at: NOW - 3 * DAY }],
  createdAt: NOW - 3 * DAY,
})
export const comprar = lexWord('comprar', 'verb', 'покупать', {
  level: 'A1',
  sources: [{ src: 'situation:banco-conta:dialogue:3', form: 'comprei', sentence: 'Ontem comprei pão na padaria.', sentenceRu: 'Вчера я купил хлеб в булочной.', at: NOW - 5 * DAY }],
  createdAt: NOW - 5 * DAY,
})
export const janela = lexWord('janela', 'noun', 'окно', { gender: 'f', level: 'A1', mark: 'known', createdAt: NOW - 2 * DAY })
export const pao = lexWord('pão', 'noun', 'хлеб', { gender: 'm', level: 'A2', createdAt: NOW - 4 * DAY })
export const xaroposo: WordEntry = word('xaroposo', 'приторный', { pos: 'adj', modes: [...ALL_MODES], sources: [{ src: 'manual', form: 'xaroposo', at: NOW - DAY }], createdAt: NOW - DAY })
export const dagua: WordEntry = word("d'água", 'воды (о стакане)', { modes: [...ALL_MODES], sources: [{ src: 'manual:import', form: "d'água", at: NOW - 6 * DAY }], createdAt: NOW - 6 * DAY })

export const DICT_WORDS = [saude, comprar, janela, pao, xaroposo, dagua]

export const DICT_CARDS: SrsCard[] = [
  dictCard(saude, 'recognize', { fsrs: fsrsNewAt() }),
  dictCard(comprar, 'recognize', { fsrs: fsrsReview(3, -DAY) }),
  dictCard(pao, 'recognize', { fsrs: fsrsReview(2, DAY), suspended: true }),
  dictCard(xaroposo, 'recognize', { fsrs: fsrsNewAt() }),
]

export const DICT_SEED: Seed = { words: DICT_WORDS, cards: DICT_CARDS, settings: { newCardsPerDay: 50 } }
