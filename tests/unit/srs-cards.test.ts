/**
 * src/features/srs/{cardContent,cardOps,kinds}.ts — error-topic links, exercise descriptions for every type, the source
 * of a card's pt text, error cards from the error log, labels.
 */
import { describe, expect, test, vi } from 'vitest'
import { getContentIndex, listSituations, listTopics, listVocabThemes, type Exercise } from '@/content'
import type { ProgressRepository } from '@/data/types.ts'
import { NOW, card, errorEntry } from '../fixtures/seed.ts'
import { cardSource, describeExercise, errorTopicLink, exercisePromptText } from '@/features/srs/cardContent'
import { cardsFromErrors, deleteCards, errorCardId, isDeleted } from '@/features/srs/cardOps'
import { KIND_CHIP, KIND_LABEL, KIND_SHORT, LISTEN_MARK, WORD_TASK } from '@/features/srs/kinds'

const topic = listTopics()[0]
const situation = listSituations()[0]
const theme = listVocabThemes()[0]

const exOfType = (type: Exercise['type']) => {
  for (const [id, loc] of getContentIndex().exercises) if (loc.exercise.type === type) return { id, ex: loc.exercise }
  throw new Error(`no ${type} exercise`)
}

describe('errorTopicLink', () => {
  test('topic, situation, unknown, empty', () => {
    expect(errorTopicLink(undefined)).toBeNull()
    expect(errorTopicLink('')).toBeNull()
    expect(errorTopicLink(topic.id)).toEqual({ to: `/topic/${topic.id}`, title: topic.title })
    expect(errorTopicLink(situation.id)).toEqual({ to: `/practice/situations/${situation.id}`, title: situation.title })
    expect(errorTopicLink('no-such-topic')).toBeNull()
  })
})

describe('describeExercise', () => {
  const base = { id: 'x', topicId: 't' }
  test.each<[string, Exercise, ReturnType<typeof describeExercise>]>([
    ['fill-gap', { ...base, type: 'fill-gap', prompt: 'Eu ___ aqui.', ru: 'Я здесь.' } as unknown as Exercise, { prompt: 'Eu ___ aqui.', instruction: 'Я здесь.' }],
    ['choice', { ...base, type: 'choice', prompt: 'P', options: ['a', 'b', 'c'] } as unknown as Exercise, { prompt: 'P', instruction: 'a / b / c' }],
    ['transform', { ...base, type: 'transform', prompt: 'P', instruction: 'I' } as unknown as Exercise, { prompt: 'P', instruction: 'I' }],
    ['order-words', { ...base, type: 'order-words', words: ['eu', 'sou'], ru: 'я есть' } as unknown as Exercise, { prompt: 'eu · sou', instruction: 'я есть' }],
    ['translate-ru-pt', { ...base, type: 'translate-ru-pt', ru: 'привет' } as unknown as Exercise, { prompt: 'привет', instruction: 'Переведите на португальский' }],
    ['listen-type', { ...base, type: 'listen-type', text: 'Olá' } as unknown as Exercise, { prompt: 'Диктант', listen: 'Olá' }],
    ['listen-choice with prompt', { ...base, type: 'listen-choice', prompt: 'Q', options: ['a', 'b'], text: 'T' } as unknown as Exercise, { prompt: 'Q', instruction: 'a / b', listen: 'T' }],
    ['listen-choice without prompt', { ...base, type: 'listen-choice', options: ['a'], text: 'T' } as unknown as Exercise, { prompt: 'Прослушайте и выберите', instruction: 'a', listen: 'T' }],
    ['match with prompt', { ...base, type: 'match', prompt: 'M', pairs: [{ left: 'a', right: 'б' }, { left: 'c', right: 'д' }] } as unknown as Exercise, { prompt: 'M', instruction: 'a — б; c — д' }],
    ['match without prompt', { ...base, type: 'match', pairs: [] } as unknown as Exercise, { prompt: 'Сопоставьте', instruction: '' }],
    ['speak-shadow', { ...base, type: 'speak-shadow', text: 'Bom dia', ru: 'Добрый день' } as unknown as Exercise, { prompt: 'Bom dia', instruction: 'Добрый день' }],
  ])('%s', (_, ex, out) => expect(describeExercise(ex)).toEqual(out))

  test('real content exercises of every type have a non-empty prompt', () => {
    const types = new Set([...getContentIndex().exercises.values()].map((l) => l.exercise.type))
    for (const t of types) expect(describeExercise(exOfType(t).ex).prompt.length).toBeGreaterThan(0)
  })

  test('exercisePromptText', () => {
    expect(exercisePromptText(undefined)).toBeUndefined()
    expect(exercisePromptText('no-such-exercise')).toBeUndefined()
    const { id, ex } = exOfType('fill-gap')
    expect(exercisePromptText(id)).toBe(describeExercise(ex).prompt)
  })
})

describe('cardSource', () => {
  test('topic example, situation phrase, theme word, situation word', () => {
    expect(cardSource(card(`ex:${topic.id}:3`))).toEqual({ kind: 'topic', id: topic.id, part: 'examples', index: 3 })
    expect(cardSource(card(`ph:${situation.id}:0`))).toEqual({ kind: 'situation', id: situation.id, part: 'phrases', index: 0 })
    expect(cardSource(card(`w:${theme.id}:12`))).toEqual({ kind: 'vocab', id: theme.id, part: 'examples', index: 12 })
    expect(cardSource(card(`w:${situation.id}:2`))).toEqual({ kind: 'situation', id: situation.id, part: 'vocab', index: 2 })
  })

  test('non-numeric / missing index → undefined index', () => {
    expect(cardSource(card(`ex:${topic.id}:x1`)).index).toBeUndefined()
    expect(cardSource(card(`ex:${topic.id}:-1`)).index).toBeUndefined()
    expect(cardSource(card(`ph:${situation.id}`)).index).toBeUndefined()
  })

  test('unknown owners and other ids fall back to the review itself', () => {
    for (const id of ['ex:nope:1', 'ph:nope:1', 'w:nope:1', 'g:r:1', 'lex:u:x:recognize', 'error:e1', '', `ex:${situation.id}:1`]) {
      expect(cardSource(card(id))).toEqual({ kind: 'review', id })
    }
  })
})

describe('cardOps', () => {
  test('isDeleted: only the legacy soft-delete flag set to true', () => {
    expect(isDeleted(card('a'))).toBe(false)
    expect(isDeleted({ ...card('a'), deleted: true } as never)).toBe(true)
    expect(isDeleted({ ...card('a'), deleted: 'yes' } as never)).toBe(false)
  })

  test('deleteCards passes ids to the repository', async () => {
    const del = vi.fn(async () => {})
    await deleteCards({ deleteCards: del } as unknown as ProgressRepository, [card('a'), card('b')])
    expect(del).toHaveBeenCalledWith(['a', 'b'])
  })

  test('cardsFromErrors: one card per exercise (first entry wins), existing cards skipped', () => {
    const fill = exOfType('fill-gap')
    const errors = [
      errorEntry('e2', { exerciseId: fill.id, given: 'new', expected: 'right-new', topicId: 't1' }),
      errorEntry('e1', { exerciseId: fill.id, given: 'old', expected: 'right-old' }),
      errorEntry('e3', { exerciseId: 'gone-exercise', given: 'zzz', expected: 'yyy' }),
      errorEntry('e4', { exerciseId: 'already' }),
    ]
    const out = cardsFromErrors(errors, [card(errorCardId('already'))], NOW)
    expect(out.map((c) => c.id)).toEqual([`error:${fill.id}`, 'error:gone-exercise'])
    expect(out[0]).toMatchObject({ kind: 'error', front: describeExercise(fill.ex).prompt, back: 'right-new', topicId: 't1', exerciseId: fill.id, createdAt: NOW })
    expect(out[0].fsrs.state).toBe(0)
    expect(out[1].front).toBe('Ошибка: «zzz»')
  })

  test('dictation errors are marked with the headphones prefix', () => {
    const lt = exOfType('listen-type')
    const [c] = cardsFromErrors([errorEntry('e', { exerciseId: lt.id })], [], NOW)
    expect(c.front.startsWith(`${LISTEN_MARK} `)).toBe(true)
    expect(c.front).toBe(`${LISTEN_MARK} ${(lt.ex as { text: string }).text}`)
  })

  test('no errors → no cards; Date.now() default', () => {
    expect(cardsFromErrors([], [])).toEqual([])
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW + 5)
    try {
      expect(cardsFromErrors([errorEntry('e', { exerciseId: 'x' })], [])[0].createdAt).toBe(NOW + 5)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('kinds', () => {
  test('every card kind has labels and a chip tone; LISTEN_MARK is 🎧', () => {
    for (const k of ['word', 'phrase', 'grammar', 'error'] as const) {
      expect(KIND_LABEL[k]).toBeTruthy()
      expect(KIND_SHORT[k]).toBeTruthy()
      expect(typeof KIND_CHIP[k]).toBe('string')
    }
    expect(LISTEN_MARK).toBe('\u{1F3A7}')
  })

  test('WORD_TASK: which side is Portuguese per mode', () => {
    expect(WORD_TASK.recognize).toMatchObject({ frontPt: true, backPt: false })
    expect(WORD_TASK.produce).toMatchObject({ frontPt: false, backPt: true })
    expect(WORD_TASK.listen).toMatchObject({ frontPt: true, backPt: true })
    expect(WORD_TASK.cloze).toMatchObject({ frontPt: true, backPt: true })
  })
})
