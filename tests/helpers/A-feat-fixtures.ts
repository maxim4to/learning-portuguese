/**
 * Stream A (features): exercise builders for every exercise kind and a recording fake ProgressRepository.
 */
import type { Exercise, ExerciseOf } from '@/content'
import { applyResult, DEFAULT_SETTINGS, type ErrorEntry, type ErrorEntryInput, type ProgressRepository, type Settings, type SrsCard, type TopicProgress, type TopicResult } from '@/data/types.ts'
import type { AnswerRecord } from '@/features/exercises/types'

const base = (id: string, topicId = 'a1-ser-estar') => ({ id, topicId })

export const ex = {
  fillGap: (id = 'fg', p: Partial<ExerciseOf<'fill-gap'>> = {}): ExerciseOf<'fill-gap'> => ({
    ...base(id),
    type: 'fill-gap',
    prompt: 'Eu ___ de Lisboa.',
    answer: ['sou'],
    ...p,
  }),
  choice: (id = 'ch', p: Partial<ExerciseOf<'choice'>> = {}): ExerciseOf<'choice'> => ({
    ...base(id),
    type: 'choice',
    prompt: 'Ela ___ cansada.',
    options: ['é', 'está'],
    correct: 1,
    ...p,
  }),
  transform: (id = 'tr', p: Partial<ExerciseOf<'transform'>> = {}): ExerciseOf<'transform'> => ({
    ...base(id),
    type: 'transform',
    instruction: 'Поставьте во множественное число:',
    prompt: 'o carro',
    answer: ['os carros'],
    ...p,
  }),
  orderWords: (id = 'ow', p: Partial<ExerciseOf<'order-words'>> = {}): ExerciseOf<'order-words'> => ({
    ...base(id),
    type: 'order-words',
    words: ['sou', 'eu', 'professor'],
    answer: 'Eu sou professor.',
    ...p,
  }),
  translate: (id = 'tl', p: Partial<ExerciseOf<'translate-ru-pt'>> = {}): ExerciseOf<'translate-ru-pt'> => ({
    ...base(id),
    type: 'translate-ru-pt',
    ru: 'Я **устал**.',
    answer: ['Estou cansado.', 'Estou cansada.'],
    ...p,
  }),
  listenType: (id = 'lt', p: Partial<ExerciseOf<'listen-type'>> = {}): ExerciseOf<'listen-type'> => ({
    ...base(id),
    type: 'listen-type',
    text: 'Bom dia!',
    answer: ['Bom dia!'],
    ...p,
  }),
  listenChoice: (id = 'lc', p: Partial<ExerciseOf<'listen-choice'>> = {}): ExerciseOf<'listen-choice'> => ({
    ...base(id),
    type: 'listen-choice',
    text: 'Obrigado',
    options: ['спасибо', 'пожалуйста'],
    correct: 0,
    ...p,
  }),
  match: (id = 'mt', p: Partial<ExerciseOf<'match'>> = {}): ExerciseOf<'match'> => ({
    ...base(id),
    type: 'match',
    pairs: [
      { left: 'casa', right: 'дом' },
      { left: 'carro', right: 'машина' },
    ],
    ...p,
  }),
  speak: (id = 'sp', p: Partial<ExerciseOf<'speak-shadow'>> = {}): ExerciseOf<'speak-shadow'> => ({
    ...base(id),
    type: 'speak-shadow',
    text: 'Muito prazer.',
    ...p,
  }),
}

/** One exercise of every kind (9 schema types: the 8 UI kinds + listen-choice). */
export const allKinds = (): Exercise[] => [
  ex.fillGap(),
  ex.choice(),
  ex.transform(),
  ex.orderWords(),
  ex.translate(),
  ex.listenType(),
  ex.listenChoice(),
  ex.match(),
  ex.speak(),
]

export function answer(exerciseId: string, ok: boolean, p: Partial<AnswerRecord> = {}): AnswerRecord {
  return { exerciseId, topicId: 'a1-ser-estar', given: ok ? 'right' : 'wrong', expected: 'right', verdict: ok ? 'correct' : 'wrong', ok, ...p }
}

/** In-memory ProgressRepository that records calls. Only the methods the feature modules use are real. */
export class FakeRepo implements ProgressRepository {
  readonly kind = 'local' as const
  progress = new Map<string, TopicProgress>()
  results: TopicResult[] = []
  cards = new Map<string, SrsCard>()
  errors: ErrorEntry[] = []
  settings: Settings = { ...DEFAULT_SETTINGS }
  upserts: SrsCard[][] = []
  private n = 0

  async getTopicProgress(id: string) {
    return this.progress.get(id)
  }
  async saveTopicResult(r: TopicResult) {
    this.results.push(r)
    const p = applyResult(this.progress.get(r.topicId), r)
    this.progress.set(r.topicId, p)
    return p
  }
  async getAllProgress() {
    return [...this.progress.values()]
  }
  async getCards() {
    return [...this.cards.values()]
  }
  async upsertCards(cs: SrsCard[]) {
    this.upserts.push(cs)
    for (const c of cs) this.cards.set(c.id, c)
  }
  async deleteCards(ids: string[]) {
    for (const id of ids) this.cards.delete(id)
  }
  async logError(e: ErrorEntryInput) {
    const entry = { ...e, id: `e${++this.n}` }
    this.errors.push(entry)
    return entry
  }
  async getErrors() {
    return [...this.errors].reverse()
  }
  async getSettings() {
    return this.settings
  }
  async saveSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch }
    return this.settings
  }
  async getWords() {
    return []
  }
  async upsertWords() {}
  async deleteWords() {}
  async saveWordBundle() {}
  async resetProgress() {}
  async exportAll(): Promise<never> {
    throw new Error('not implemented')
  }
  async importAll() {
    return { skipped: 0 }
  }
}
