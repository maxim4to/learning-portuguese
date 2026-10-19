/**
 * Workstream B · SRS: shared fixtures for tests/component/srs/**.
 *
 * Words used across the SRS tests (personal dictionary, real lexicon-like shapes) and small DOM helpers.
 * Audio is mocked in each test file (vi.mock is hoisted per file): see `audioMock()` for the factory body.
 */
import { act } from '@testing-library/react'
import { vi } from 'vitest'
import type { WordEntry } from '../../src/data/types.ts'
import { DAY, NOW, word } from '../fixtures/seed'

/** a casa — noun, f., with an example sentence from a manual source. */
export const casa: WordEntry = word('casa', 'дом; жилище', {
  pos: 'noun',
  gender: 'f',
  sources: [{ src: 'manual', form: 'casa', at: NOW - DAY, sentence: 'A minha casa fica perto do rio.', sentenceRu: 'Мой дом рядом с рекой.' }],
})

/** comer — verb, the seen form «come» in its sentence (cloze masks «come»). */
export const comer: WordEntry = word('comer', 'есть, кушать', {
  pos: 'verb',
  sources: [{ src: 'manual', form: 'come', at: NOW - DAY, sentence: 'Ele come pão todos os dias.', sentenceRu: 'Он ест хлеб каждый день.' }],
})

/** saúde — noun, f., accented (typed-answer accent tests). */
export const saude: WordEntry = word('saúde', 'здоровье', { pos: 'noun', gender: 'f' })

/** Plain verbs for distractors / batches. */
export const beber = word('beber', 'пить', { pos: 'verb' })
export const dormir = word('dormir', 'спать', { pos: 'verb' })
export const falar = word('falar', 'говорить', { pos: 'verb' })
export const andar = word('andar', 'ходить', { pos: 'verb' })
export const ler = word('ler', 'читать', { pos: 'verb' })

/** localStorage key of today's new-card counter (newCardCounter.ts) for `now` (local day). */
export function newSeenKey(now = NOW): string {
  const d = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  return `ptpt:v1:srs-new:${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Fake only Date (timers stay real so RTL/user-event work); Date.now() === `at` until moved with `setNow`. */
export function freezeDate(at = NOW): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(at)
}

export function setNow(at: number): void {
  vi.setSystemTime(at)
}

/** Lets pending promise callbacks (repo writes → store notify) settle inside act(). */
export async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
}

/** Parsed `ptpt:v1:cards` from localStorage (what LocalBackend persisted). */
export function storedCards(): Record<string, import('../../src/data/types.ts').SrsCard> {
  return JSON.parse(localStorage.getItem('ptpt:v1:cards') ?? '{}')
}
