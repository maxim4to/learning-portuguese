/** Review rules of dictionary cards shared by ReviewSession and WordCardFace (no components here). */
import type { Settings, SrsCard } from '@/data/types.ts'
import type { ReviewRating } from '@/engine/fsrs'
import type { AnswerRecord } from '@/features/exercises/types'

/** Word cards answered by typing (produce / listen / cloze while Settings.typeWordAnswers is on). */
export function isTypedWordCard(card: SrsCard | undefined, settings: Partial<Pick<Settings, 'typeWordAnswers'>> | null): boolean {
  return !!card?.wordId && !!card.mode && card.mode !== 'recognize' && (settings?.typeWordAnswers ?? true)
}

/**
 * Rating suggested by a typed word answer: right → Хорошо; accents only → Трудно (Хорошо when
 * Settings.lenientAccents counts it as right); wrong / «Не знаю» → Снова.
 */
export function suggestWordRating(rec: Pick<AnswerRecord, 'verdict' | 'skipped' | 'ok'>): ReviewRating {
  if (rec.skipped || rec.verdict === 'wrong') return 'again'
  if (rec.verdict === 'accents') return rec.ok ? 'good' : 'hard'
  return 'good'
}
