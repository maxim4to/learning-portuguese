/**
 * «Учить новые»: which saved words are introduced next, and how many fit today's new-card limit.
 * Pure (relative imports) — shared by WordsPage, ReviewPage and LearnNewSession.
 */
import type { SrsCard, WordEntry, WordStatus } from '../../data/types.ts'
import { wordCardId } from './wordOps.ts'

/** Words per «Учить новые» session (doc: up to 5, within the daily limit). */
export const LEARN_BATCH = 5

export interface LearnItem {
  entry: WordEntry
  /** Its recognize card (new, not suspended) — rated by the quick check. */
  card: SrsCard
}

/** Last time the word was met (newest source), or when it was saved. */
const lastSeen = (w: WordEntry) => Math.max(w.createdAt, ...w.sources.map((s) => s.at))

/**
 * Words waiting to be introduced: status «new» with a fresh, active recognize card.
 * Priority: met most recently first; among equals, words with an example sentence first.
 */
export function learnCandidates(
  words: readonly WordEntry[],
  cardsByWord: ReadonlyMap<string, readonly SrsCard[]>,
  statuses: ReadonlyMap<string, WordStatus>,
): LearnItem[] {
  const out: LearnItem[] = []
  for (const entry of words) {
    if (statuses.get(entry.id) !== 'new' || entry.mark === 'known') continue
    const card = cardsByWord.get(entry.id)?.find((c) => c.id === wordCardId(entry.id, 'recognize'))
    if (!card || card.suspended || card.fsrs.state !== 0) continue
    out.push({ entry, card })
  }
  const hasSentence = (w: WordEntry) => (w.sources.some((s) => s.sentence?.trim()) ? 1 : 0)
  return out.sort((a, b) => lastSeen(b.entry) - lastSeen(a.entry) || hasSentence(b.entry) - hasSentence(a.entry))
}

/** How many words a session introduces now: ≤ LEARN_BATCH, ≤ what is left of today's new-card limit. */
export function learnCount(candidates: number, newPerDay: number, newSeenToday: number): number {
  return Math.max(0, Math.min(LEARN_BATCH, newPerDay - newSeenToday, candidates))
}
