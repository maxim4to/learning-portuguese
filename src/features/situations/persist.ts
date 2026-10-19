/** SRS cards and local drafts for situation modules. */
import type { Situation } from '@/content'
import type { CardKind, ProgressRepository } from '@/data'
import { createSrsCard } from '@/engine/fsrs'

/** Id of an SRS card made from a situation phrase. */
export const phraseCardId = (situationId: string, index: number) => `ph:${situationId}:${index}`
/** Id of an SRS card made from a situation vocab word. */
export const wordCardId = (situationId: string, index: number) => `w:${situationId}:${index}`

export interface CardSpec {
  id: string
  kind: CardKind
  /** ru */
  front: string
  /** pt-PT */
  back: string
}

export const phraseCards = (s: Situation): CardSpec[] =>
  s.phrases.map((p, i) => ({ id: phraseCardId(s.id, i), kind: 'phrase', front: p.ru, back: p.pt }))

export const wordCards = (s: Situation): CardSpec[] =>
  s.vocab.map((w, i) => ({ id: wordCardId(s.id, i), kind: 'word', front: w.ru, back: w.pt }))

/** Ids of the given specs that already exist as SRS cards. */
export async function existingCardIds(repo: ProgressRepository, specs: readonly CardSpec[]): Promise<Set<string>> {
  const want = new Set(specs.map((c) => c.id))
  return new Set((await repo.getCards()).map((c) => c.id).filter((id) => want.has(id)))
}

/** Creates SRS cards for specs that aren't cards yet (existing cards keep their FSRS state). Returns how many were added. */
export async function addCards(repo: ProgressRepository, situationId: string, specs: readonly CardSpec[]): Promise<number> {
  const have = await existingCardIds(repo, specs)
  const now = Date.now()
  const fresh = specs
    .filter((c) => !have.has(c.id))
    .map((c) => createSrsCard({ ...c, topicId: situationId }, now))
  if (fresh.length) await repo.upsertCards(fresh)
  return fresh.length
}

// --- Writing drafts (per device, localStorage) --------------------------------

export const writingKey = (situationId: string) => `ptpt:v1:writing:${situationId}`

export function loadWriting(situationId: string): string {
  try {
    return localStorage.getItem(writingKey(situationId)) ?? ''
  } catch {
    return ''
  }
}

export function saveWriting(situationId: string, text: string): void {
  try {
    if (text) localStorage.setItem(writingKey(situationId), text)
    else localStorage.removeItem(writingKey(situationId))
  } catch {
    // storage unavailable (private mode) — draft lives in memory only
  }
}
