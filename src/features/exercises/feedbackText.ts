import type { Exercise } from '@/content'
import type { AnswerRecord } from './types'

export type FeedbackTone = 'correct' | 'accents' | 'wrong' | 'skipped'

export function feedbackTone(rec: AnswerRecord): FeedbackTone {
  if (rec.skipped) return 'skipped'
  if (rec.verdict === 'correct') return 'correct'
  if (rec.verdict === 'accents') return 'accents'
  return 'wrong'
}

/** Short summary for the screen-reader live region. */
export function feedbackSummary(ex: Exercise, rec: AnswerRecord, lenient: boolean): string {
  const t = feedbackTone(rec)
  if (ex.type === 'speak-shadow') return rec.ok ? 'Отлично!' : 'Потренируйтесь ещё.'
  if (t === 'correct') return 'Верно!'
  const right = ex.type === 'match' ? '' : ` Правильно: ${rec.expected}`
  if (t === 'accents') return (lenient ? 'Верно, но проверьте акценты.' : 'Почти: ошибка в акцентах.') + right
  if (t === 'skipped') return `Ответ:${right || ' см. пары'}`
  return `Неверно.${right}`
}

