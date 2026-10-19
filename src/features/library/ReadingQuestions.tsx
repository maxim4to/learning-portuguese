import { useEffect, useState } from 'react'
import type { Exercise, ReadingText } from '@/content'
import { useRepository, type TopicStatus } from '@/data'
import { ExerciseRunner, type RunSummary } from '@/features/exercises'
import { saveRun, type SaveOutcome } from '@/features/lessons/persist'
import { ResultScreen } from '@/features/lessons/ResultScreen'
import { plural } from './format'
import { practicePath } from '@/features/practice/paths'

interface Run {
  key: number
  list: readonly Exercise[]
  retry: boolean
}

interface Result {
  summary: RunSummary
  list: readonly Exercise[]
  retry: boolean
  before: TopicStatus
  saving: boolean
  outcome?: SaveOutcome
  error?: string
}

/**
 * Comprehension questions. Results are saved like lessons: progress keyed by the reading id
 * (source 'lesson'), wrong answers logged and turned into error cards. Retrying mistakes doesn't count.
 */
export function ReadingQuestions({ text }: { text: ReadingText }) {
  const repo = useRepository()
  const [status, setStatus] = useState<TopicStatus>('not-started')
  const [run, setRun] = useState<Run | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    let alive = true
    repo
      .getTopicProgress(text.id)
      .then((p) => alive && setStatus(p?.status ?? 'not-started'))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [repo, text.id])

  const start = (list: readonly Exercise[], retry: boolean) => {
    setResult(null)
    setRun((r) => ({ key: (r?.key ?? 0) + 1, list, retry }))
  }

  function finish(summary: RunSummary) {
    if (!run) return
    const { list, retry } = run
    setResult({ summary, list, retry, before: status, saving: true })
    saveRun(repo, { id: text.id }, summary, list, { source: 'lesson', countProgress: !retry })
      .then((outcome) => {
        setResult((r) => (r && r.summary === summary ? { ...r, saving: false, outcome } : r))
        if (outcome.progress) setStatus(outcome.progress.status)
      })
      .catch((e: unknown) =>
        setResult((r) =>
          r && r.summary === summary ? { ...r, saving: false, error: e instanceof Error ? e.message : String(e) } : r,
        ),
      )
  }

  if (result) {
    const wrongIds = new Set(result.summary.answers.filter((a) => !a.ok).map((a) => a.exerciseId))
    return (
      <ResultScreen
        statusLabel="Статус текста:"
        back={{ to: practicePath('reading'), label: 'К текстам' }}
        summary={result.summary}
        exercises={result.list}
        retry={result.retry}
        before={result.before}
        saving={result.saving}
        outcome={result.outcome}
        error={result.error}
        onRetryWrong={() => start(result.list.filter((e) => wrongIds.has(e.id)), true)}
        onRestart={() => start(text.questions, false)}
      />
    )
  }

  if (!run) {
    return (
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink-muted">
          {plural(text.questions.length, 'вопрос', 'вопроса', 'вопросов')} на понимание. Результат сохранится в прогрессе,
          ошибки попадут в повторение.
        </p>
        <button type="button" className="btn-primary shrink-0" onClick={() => start(text.questions, false)}>
          Ответить на вопросы
        </button>
      </div>
    )
  }

  return (
    <ExerciseRunner
      panel={false}
      key={run.key}
      exercises={run.list}
      title={run.retry ? 'Работа над ошибками' : text.title}
      persistKey={`reading:${text.id}${run.retry ? ':retry' : ''}`}
      onFinish={finish}
      focusOnMount
    />
  )
}
