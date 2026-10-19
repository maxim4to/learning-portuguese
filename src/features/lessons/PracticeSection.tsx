import { useState } from 'react'
import type { Exercise, Topic } from '@/content'
import { useRepository, type TopicProgress, type TopicStatus } from '@/data'
import { ExerciseRunner, type RunSummary } from '@/features/exercises'
import { saveRun, type SaveOutcome } from './persist'
import { ResultScreen } from './ResultScreen'

interface PracticeSectionProps {
  topic: Topic
  exercises: Exercise[]
  source: 'lesson' | 'mini-test'
  title: string
  /** Progress before the run (for the "status change" line). */
  progress?: TopicProgress
  /** Called after results are persisted (to refresh progress). */
  onSaved(): void
  next?: { label: string; onClick(): void }
}

interface Run {
  key: number
  list: Exercise[]
  retry: boolean
}

interface Result {
  summary: RunSummary
  list: Exercise[]
  retry: boolean
  before: TopicStatus
  saving: boolean
  outcome?: SaveOutcome
  error?: string
}

export function PracticeSection({ topic, exercises, source, title, progress, onSaved, next }: PracticeSectionProps) {
  const repo = useRepository()
  const [run, setRun] = useState<Run>({ key: 0, list: exercises, retry: false })
  const [result, setResult] = useState<Result | null>(null)

  if (!exercises.length) return <p className="text-stone-500">В этой теме пока нет заданий этого типа.</p>

  function start(list: Exercise[], retry: boolean) {
    setResult(null)
    setRun((r) => ({ key: r.key + 1, list, retry }))
  }

  function finish(summary: RunSummary) {
    const { list, retry } = run
    const before = progress?.status ?? 'not-started'
    setResult({ summary, list, retry, before, saving: true })
    saveRun(repo, topic, summary, list, { source, countProgress: !retry })
      .then((outcome) => {
        setResult((r) => (r && r.summary === summary ? { ...r, saving: false, outcome } : r))
        onSaved()
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
        topic={topic}
        summary={result.summary}
        exercises={result.list}
        retry={result.retry}
        before={result.before}
        saving={result.saving}
        outcome={result.outcome}
        error={result.error}
        onRetryWrong={() => start(result.list.filter((e) => wrongIds.has(e.id)), true)}
        onRestart={() => start(exercises, false)}
        next={next}
      />
    )
  }

  return (
    <ExerciseRunner
      key={run.key}
      exercises={run.list}
      title={run.retry ? `${title}: работа над ошибками` : title}
      onFinish={finish}
    />
  )
}
