/**
 * Workstream B (exercises / lessons / diagnostic): synthetic exercises of every kind with predictable content,
 * plus small helpers. Real content is used by the page-level tests; these keep kind tests independent of it.
 */
import type { Exercise, ExerciseOf } from '@/content'
import type { AnswerRecord, RunSummary } from '@/features/exercises'

const T = 'a1-ser-estar'

export const fillGap: ExerciseOf<'fill-gap'> = {
  id: 'bx-fill',
  topicId: T,
  type: 'fill-gap',
  prompt: 'Eu ___ de Lisboa.',
  answer: ['sou'],
  ru: 'Я из Лиссабона.',
  hint: 'ser',
  explanation: 'Происхождение — **ser**.',
}

export const fillGap2: ExerciseOf<'fill-gap'> = {
  id: 'bx-fill2',
  topicId: T,
  type: 'fill-gap',
  prompt: 'Ele ___ médico e ___ cansado.',
  answer: ['é / está'],
}

export const fillAccent: ExerciseOf<'fill-gap'> = {
  id: 'bx-fill-acc',
  topicId: T,
  type: 'fill-gap',
  prompt: 'Ela ___ em casa.',
  answer: ['está'],
}

export const choice: ExerciseOf<'choice'> = {
  id: 'bx-choice',
  topicId: T,
  type: 'choice',
  prompt: 'A Maria ___ cansada.',
  options: ['é', 'está', 'são'],
  correct: 1,
  explanation: 'Состояние — estar.',
}

export const listenChoice: ExerciseOf<'listen-choice'> = {
  id: 'bx-lchoice',
  topicId: T,
  type: 'listen-choice',
  text: 'Bom dia',
  prompt: 'Что вы услышали?',
  options: ['Boa noite', 'Bom dia'],
  correct: 1,
}

export const transform: ExerciseOf<'transform'> = {
  id: 'bx-transform',
  topicId: T,
  type: 'transform',
  instruction: 'Поставьте во множественное число',
  prompt: 'Eu sou alto.',
  answer: ['Nós somos altos.', 'Somos altos.'],
}

export const translate: ExerciseOf<'translate-ru-pt'> = {
  id: 'bx-translate',
  topicId: T,
  type: 'translate-ru-pt',
  ru: 'Я устал.',
  answer: ['Estou cansado.'],
}

export const listenType: ExerciseOf<'listen-type'> = {
  id: 'bx-ltype',
  topicId: T,
  type: 'listen-type',
  text: 'Obrigado',
  answer: ['Obrigado'],
}

export const orderWords: ExerciseOf<'order-words'> = {
  id: 'bx-order',
  topicId: T,
  type: 'order-words',
  words: ['Eu', 'sou', 'professor'],
  answer: 'Eu sou professor',
  ru: 'Я учитель.',
}

export const match: ExerciseOf<'match'> = {
  id: 'bx-match',
  topicId: T,
  type: 'match',
  prompt: 'Соедините глагол и перевод',
  pairs: [
    { left: 'ser', right: 'быть (постоянно)' },
    { left: 'estar', right: 'быть (временно)' },
  ],
}

export const shadow: ExerciseOf<'speak-shadow'> = {
  id: 'bx-shadow',
  topicId: T,
  type: 'speak-shadow',
  text: 'Muito prazer',
  ru: 'Очень приятно',
}

export const ALL_KINDS: Exercise[] = [fillGap, choice, transform, orderWords, translate, listenType, listenChoice, match, shadow]

export function rec(ex: Exercise, patch: Partial<AnswerRecord> = {}): AnswerRecord {
  return { exerciseId: ex.id, topicId: ex.topicId, given: 'x', expected: 'y', verdict: 'correct', ok: true, ...patch }
}

export function summary(answers: AnswerRecord[]): RunSummary {
  return { correct: answers.filter((a) => a.ok).length, total: answers.length, answers }
}

/** Deterministic Math.random for shuffles (identity order with Fisher–Yates when it returns ~1). */
export function noShuffle() {
  return 0.999999
}
