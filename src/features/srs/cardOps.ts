/** Card mutations not covered by ProgressRepository's minimal API. */
import type { ErrorEntry, ProgressRepository, SrsCard } from '@/data/types.ts'
import { findExercise } from '@/content'
import { createSrsCard } from '@/engine/fsrs'
import { describeExercise } from './cardContent'

/** Legacy soft-delete marker (cards written by older builds before `repo.deleteCards` existed). */
type MaybeDeleted = SrsCard & { deleted?: boolean }

export const isDeleted = (c: SrsCard) => (c as MaybeDeleted).deleted === true

/** Hard-deletes cards via the repository. */
export async function deleteCards(repo: ProgressRepository, cards: SrsCard[]): Promise<void> {
  await repo.deleteCards(cards.map((c) => c.id))
}

export const errorCardId = (exerciseId: string) => `error:${exerciseId}`

/** Builds 'error' cards for logged errors that have no card yet (one per exercise, newest error wins). */
export function cardsFromErrors(errors: ErrorEntry[], existing: SrsCard[], now = Date.now()): SrsCard[] {
  const have = new Set(existing.map((c) => c.id))
  const out = new Map<string, SrsCard>()
  for (const e of errors) {
    const id = errorCardId(e.exerciseId)
    if (have.has(id) || out.has(id)) continue
    const ex = findExercise(e.exerciseId)?.exercise
    const d = ex ? describeExercise(ex) : undefined
    const front = d ? (d.listen ? `🎧 ${d.listen}` : d.prompt) : `Ошибка: «${e.given}»`
    out.set(id, createSrsCard({ id, kind: 'error', front, back: e.expected, topicId: e.topicId, exerciseId: e.exerciseId }, now))
  }
  return [...out.values()]
}
