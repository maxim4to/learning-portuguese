/** Saving a diagnostic run: per-topic results + error log + lastDiagnosticAt. No SRS cards (review stays clean). */
import type { DiagnosticQuestion } from '@/content'
import type { ProgressRepository } from '@/data'
import type { AnswerRecord } from '@/features/exercises'
import { outcomesFromAnswers } from './plan'

export async function saveDiagnostic(
  repo: ProgressRepository,
  answers: readonly AnswerRecord[],
  questions: readonly DiagnosticQuestion[],
  at: number,
): Promise<{ topicsSaved: number; errorsLogged: number }> {
  const outcomes = outcomesFromAnswers(answers)
  // One topic per document: sequential writes keep read-modify-write repositories safe.
  for (const [topicId, o] of outcomes) {
    await repo.saveTopicResult({ topicId, correct: o.correct, total: o.total, at, source: 'diagnostic' })
  }
  const types = new Map(questions.map((q) => [q.id, q.type]))
  const wrong = answers.filter((a) => !a.ok && types.get(a.exerciseId) !== 'speak-shadow')
  await Promise.all(
    wrong.map((a) => repo.logError({ exerciseId: a.exerciseId, topicId: a.topicId, given: a.given, expected: a.expected, at })),
  )
  await repo.saveSettings({ lastDiagnosticAt: at })
  return { topicsSaved: outcomes.size, errorsLogged: wrong.length }
}
