import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { Exercise, Topic } from '@/content'
import { useRepository, type TopicProgress, type TopicStatus } from '@/data'
import { ExerciseRunner, type RunSummary } from '@/features/exercises'
import { plural } from '@/features/library/format'
import { planNext } from './nextSteps'
import { saveRun, type SaveOutcome } from './persist'
import { ResultScreen, type PrimaryAction } from './ResultScreen'

interface PracticeSectionProps {
  topic: Topic
  exercises: Exercise[]
  source: 'lesson' | 'mini-test'
  title: string
  /** Progress before the run (for the "status change" line). */
  progress?: TopicProgress
  /** Progress of every topic (for «Что дальше»). */
  progressMap: Map<string, TopicProgress>
  /** Called after results are persisted (to refresh progress). */
  onSaved(): void
  /** Opens the topic's mini-test tab (offered after the exercises). */
  onMiniTest?(): void
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

export function PracticeSection({ topic, exercises, source, title, progress, progressMap, onSaved, onMiniTest }: PracticeSectionProps) {
  const repo = useRepository()
  const [run, setRun] = useState<Run>({ key: 0, list: exercises, retry: false })
  const [result, setResult] = useState<Result | null>(null)

  if (!exercises.length) return <p className="text-ink-muted">В этой теме пока нет заданий этого типа.</p>

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
    const { summary } = result
    const wrongList = summary.answers.filter((a) => !a.ok)
    const wrongIds = new Set(wrongList.map((a) => a.exerciseId))
    const retryWrong = () => start(result.list.filter((e) => wrongIds.has(e.id)), true)
    const map = new Map(progressMap)
    if (result.outcome?.progress) map.set(topic.id, result.outcome.progress)
    const plan = planNext({
      topic,
      progress: map,
      source,
      pct: summary.total ? summary.correct / summary.total : 0,
      wrong: wrongList.length,
      retry: result.retry,
      hasMiniTest: topic.miniTest.length > 0 && !!onMiniTest,
    })
    const step = plan.primary
    const primary: PrimaryAction =
      step.kind === 'retry-wrong'
        ? { label: `Повторить ошибки (${wrongList.length})`, onClick: retryWrong, icon: <RotateCcw /> }
        : step.kind === 'mini-test'
          ? { label: `Мини-тест · ${plural(topic.miniTest.length, 'вопрос', 'вопроса', 'вопросов')}`, onClick: onMiniTest }
          : step.kind === 'topic'
            ? {
                label: `${step.rec.reason === 'prereq' ? 'Подтянуть' : 'Следующая тема'}: ${step.rec.topic.title}`,
                kicker: step.rec.reason === 'prereq' ? 'Подтянуть' : 'Следующая тема',
                title: step.rec.topic.title,
                to: `/topic/${step.rec.topic.id}`,
              }
            : { label: 'К курсу', to: '/syllabus' }
    return (
      <ResultScreen
        runTitle={source === 'mini-test' ? 'Мини-тест' : 'Упражнения пройдены'}
        summary={summary}
        exercises={result.list}
        retry={result.retry}
        before={result.before}
        saving={result.saving}
        outcome={result.outcome}
        error={result.error}
        onRetryWrong={retryWrong}
        onRestart={() => start(exercises, false)}
        primary={primary}
        recs={plan.recs}
      />
    )
  }

  return (
    <ExerciseRunner
      key={run.key}
      exercises={run.list}
      title={run.retry ? `${title}: работа над ошибками` : title}
      persistKey={`topic:${topic.id}:${source}${run.retry ? ':retry' : ''}`}
      onFinish={finish}
      focusOnMount={run.key > 0}
    />
  )
}
