/** Saving lesson / mini-test results: progress, error log, SRS cards. */
import type { Exercise, Topic } from '@/content'
import type { ErrorEntryInput, ProgressRepository, ResultSource, SrsCard, TopicProgress } from '@/data'
import type { RunSummary } from '@/features/exercises'
import { cardsFromErrors } from '@/features/srs/cardOps'
import type { PickSpec } from '@/features/srs/useReviewPicker'

/** Id of an SRS card made from a topic example. */
export const exampleCardId = (topicId: string, index: number) => `ex:${topicId}:${index}`

export interface SaveOutcome {
  /** undefined when the run was a retry of mistakes (not counted towards progress). */
  progress?: TopicProgress
  errorsLogged: number
  cardsAdded: number
  /**
   * Cards for «Не знаю» answers, NOT saved yet: the result screen offers to add them
   * (a run of skips must not flood the review queue).
   */
  pendingCards: SrsCard[]
}

/** Errors already logged in this tab session (exerciseId + given) — a retry doesn't log the same mistake twice. */
const SESSION_KEY = 'ptpt:v1:logged-errors'
function loggedThisSession(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
function rememberLogged(keys: Set<string>) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...keys].slice(-500)))
  } catch {
    // ignore
  }
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

  const seen = loggedThisSession()
  const wrong = summary.answers.filter((a) => {
    if (a.ok || !isRealError(byId.get(a.exerciseId))) return false
    const k = `${a.exerciseId}|${a.given}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  rememberLogged(seen)
  const skippedIds = new Set(wrong.filter((a) => a.skipped).map((a) => a.exerciseId))
  const entries: ErrorEntryInput[] = wrong.map((a) => ({
    exerciseId: a.exerciseId,
    topicId: a.topicId,
    given: a.given,
    expected: a.expected,
    at,
  }))
  const logged = await Promise.all(entries.map((e) => repo.logError(e)))

  let cardsAdded = 0
  let pendingCards: SrsCard[] = []
  if (logged.length) {
    // Same id scheme / front format as the SRS module (`error:<exerciseId>`); existing cards keep their FSRS state.
    const fresh = cardsFromErrors(logged, await repo.getCards(), at)
    const now = fresh.filter((c) => !c.exerciseId || !skippedIds.has(c.exerciseId))
    pendingCards = fresh.filter((c) => c.exerciseId && skippedIds.has(c.exerciseId))
    if (now.length) await repo.upsertCards(now)
    cardsAdded = now.length
  }
  return { progress, errorsLogged: logged.length, cardsAdded, pendingCards }
}

/** Review specs for the topic examples ('grammar' cards: front = ru, back = pt), ids `ex:<topicId>:<i>`. */
export const exampleCardSpecs = (topic: Topic): PickSpec[] =>
  topic.examples.map((ex, i) => ({ id: exampleCardId(topic.id, i), kind: 'grammar', front: ex.ru, back: ex.pt, topicId: topic.id }))
