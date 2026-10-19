/** Saving lesson / mini-test results: progress, error log, SRS cards. */
import type { Exercise, Topic } from '@/content'
import type { ErrorEntryInput, ProgressRepository, ResultSource, SrsCard, TopicProgress } from '@/data'
import { createSrsCard } from '@/engine/fsrs'
import type { RunSummary } from '@/features/exercises'
import { cardsFromErrors } from '@/features/srs/cardOps'

/** Id of an SRS card made from a topic example. */
export const exampleCardId = (topicId: string, index: number) => `ex:${topicId}:${index}`

export interface SaveOutcome {
  /** undefined when the run was a retry of mistakes (not counted towards progress). */
  progress?: TopicProgress
  errorsLogged: number
  cardsAdded: number
}

/** Self-graded shadowing "again" is not an error worth a card. */
const isRealError = (ex: Exercise | undefined) => ex?.type !== 'speak-shadow'

export async function saveRun(
  repo: ProgressRepository,
  /** Grammar topic or situation (progress is keyed by its id). */
  topic: Pick<Topic, 'id'>,
  summary: RunSummary,
  exercises: readonly Exercise[],
  opts: { source: ResultSource; countProgress: boolean },
): Promise<SaveOutcome> {
  const at = Date.now()
  const byId = new Map(exercises.map((e) => [e.id, e]))

  const progress = opts.countProgress
    ? await repo.saveTopicResult({ topicId: topic.id, correct: summary.correct, total: summary.total, at, source: opts.source })
    : undefined

  const wrong = summary.answers.filter((a) => !a.ok && isRealError(byId.get(a.exerciseId)))
  const entries: ErrorEntryInput[] = wrong.map((a) => ({
    exerciseId: a.exerciseId,
    topicId: a.topicId,
    given: a.given,
    expected: a.expected,
    at,
  }))
  const logged = await Promise.all(entries.map((e) => repo.logError(e)))

  let cardsAdded = 0
  if (logged.length) {
    // Same id scheme / front format as the SRS module (`error:<exerciseId>`); existing cards keep their FSRS state.
    const fresh = cardsFromErrors(logged, await repo.getCards(), at)
    if (fresh.length) await repo.upsertCards(fresh)
    cardsAdded = fresh.length
  }
  return { progress, errorsLogged: logged.length, cardsAdded }
}

/** Creates 'grammar' cards (front = ru, back = pt) for topic examples that aren't cards yet. Returns how many were added. */
export async function addExampleCards(repo: ProgressRepository, topic: Topic): Promise<number> {
  const have = new Set((await repo.getCards()).map((c) => c.id))
  const now = Date.now()
  const fresh: SrsCard[] = topic.examples
    .map((ex, i) => ({ ex, id: exampleCardId(topic.id, i) }))
    .filter(({ id }) => !have.has(id))
    .map(({ ex, id }) => createSrsCard({ id, kind: 'grammar', front: ex.ru, back: ex.pt, topicId: topic.id }, now))
  if (fresh.length) await repo.upsertCards(fresh)
  return fresh.length
}

/** Number of topic examples already present as SRS cards. */
export async function countExampleCards(repo: ProgressRepository, topic: Topic): Promise<number> {
  const have = new Set((await repo.getCards()).map((c) => c.id))
  return topic.examples.filter((_, i) => have.has(exampleCardId(topic.id, i))).length
}
