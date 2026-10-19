import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LEVELS, getDiagnostic, type Level } from '@/content'
import { useRepository } from '@/data'
import { useProgressData } from '@/features/dashboard/useProgressData'
import { ExerciseRunner, type AnswerRecord, type RunSummary } from '@/features/exercises'
import { DiagnosticResult, GradeCounts } from './DiagnosticResult'
import { saveDiagnostic } from './persist'
import {
  STOP_THRESHOLD,
  buildStages,
  formatDate,
  lastResultFromHistory,
  outcomesFromAnswers,
  type DiagnosticResultData,
  type Stage,
} from './plan'

type Phase =
  | { kind: 'intro' }
  | { kind: 'last' }
  | { kind: 'run'; stage: number }
  /** Between stages: `stage` is the one just finished. */
  | { kind: 'between'; stage: number }
  | { kind: 'result'; data: DiagnosticResultData; saving: boolean; error?: string; note?: string }

/** ~17 s per question. */
const minutesFor = (n: number) => Math.max(5, Math.round((n * 17) / 60 / 5) * 5)

export function DiagnosticPage() {
  const diagnostic = getDiagnostic()
  const questions = diagnostic.questions
  const repo = useRepository()
  const { loading, settings, progress, reload } = useProgressData()

  const [phase, setPhase] = useState<Phase>({ kind: 'intro' })
  const [stages, setStages] = useState<Stage[]>([])
  const [results, setResults] = useState<RunSummary[]>([])
  const [runId, setRunId] = useState(0)

  const last = useMemo(
    () => (loading ? undefined : lastResultFromHistory(settings?.lastDiagnosticAt, progress.values(), questions)),
    [loading, settings, progress, questions],
  )

  const perLevel = useMemo(
    () => LEVELS.map((level) => ({ level, n: questions.filter((q) => q.level === level).length })).filter((x) => x.n > 0),
    [questions],
  )

  // Each phase starts at the top of the page (long result maps, mobile).
  const phaseKey = phase.kind === 'run' || phase.kind === 'between' ? `${phase.kind}:${phase.stage}` : phase.kind
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [phaseKey])

  function start() {
    setStages(buildStages(questions))
    setResults([])
    setRunId((r) => r + 1)
    setPhase({ kind: 'run', stage: 0 })
  }

  async function finish(done: RunSummary[], usedStages: Stage[]) {
    const at = Date.now()
    const answers: AnswerRecord[] = done.flatMap((s) => s.answers)
    const topics = outcomesFromAnswers(answers)
    const skippedLevels = usedStages.slice(done.length).map((s) => s.level)
    const data: DiagnosticResultData = { at, topics, skippedLevels }
    setPhase({ kind: 'result', data, saving: true })
    try {
      const { errorsLogged } = await saveDiagnostic(repo, answers, questions, at)
      setPhase({
        kind: 'result',
        data,
        saving: false,
        note: errorsLogged > 0 ? `Ошибки записаны в журнал (+${errorsLogged}); карточки на повторение не создавались.` : undefined,
      })
    } catch (e) {
      setPhase({ kind: 'result', data, saving: false, error: e instanceof Error ? e.message : String(e) })
    }
    void reload()
  }

  function onStageFinish(summary: RunSummary) {
    if (phase.kind !== 'run') return
    const done = [...results, summary]
    setResults(done)
    if (phase.stage >= stages.length - 1) void finish(done, stages)
    else setPhase({ kind: 'between', stage: phase.stage })
  }

  if (phase.kind === 'run') {
    const stage = stages[phase.stage]
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl">Диагностика</h1>
          <StageDots stages={stages} current={phase.stage} />
        </div>
        <ExerciseRunner
          key={`${runId}:${phase.stage}`}
          exercises={stage.questions}
          title={`Этап ${phase.stage + 1} из ${stages.length} · уровень ${stage.level}`}
          onFinish={onStageFinish}
        />
      </div>
    )
  }

  if (phase.kind === 'between') {
    const s = results[phase.stage]
    const nextStage = stages[phase.stage + 1]
    const ratio = s.total ? s.correct / s.total : 0
    return (
      <Interstitial
        level={stages[phase.stage].level}
        nextLevel={nextStage.level}
        correct={s.correct}
        total={s.total}
        low={ratio < STOP_THRESHOLD}
        stages={stages}
        current={phase.stage}
        onContinue={() => setPhase({ kind: 'run', stage: phase.stage + 1 })}
        onStop={() => void finish(results, stages)}
      />
    )
  }

  if (phase.kind === 'result') {
    return (
      <DiagnosticResult
        data={phase.data}
        heading="Результат диагностики"
        saving={phase.saving}
        error={phase.error}
        note={phase.note}
        onRestart={start}
      />
    )
  }

  if (phase.kind === 'last' && last) {
    return (
      <div className="space-y-4">
        <button type="button" className="text-sm text-brand-700 dark:text-brand-500" onClick={() => setPhase({ kind: 'intro' })}>
          ← Назад
        </button>
        <DiagnosticResult data={last} heading="Последний результат" onRestart={start} />
      </div>
    )
  }

  // --- Intro -------------------------------------------------------------------
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="card space-y-4 sm:p-6">
        <h1>Диагностика</h1>
        <p className="text-stone-700 dark:text-stone-300">
          Короткий тест по грамматике европейского португальского: по 1–2 вопроса на каждую тему курса. По результату
          темы окрашиваются в зелёный, жёлтый или красный, и вы получаете персональный маршрут — сначала то, что
          проседает.
        </p>
        <ul className="grid grid-cols-3 gap-2 text-sm leading-tight">
          <li className="rounded-xl bg-stone-100 px-3 py-2 dark:bg-stone-800">
            <span className="block text-lg font-semibold tabular-nums">{questions.length}</span>
            вопросов
          </li>
          <li className="rounded-xl bg-stone-100 px-3 py-2 dark:bg-stone-800">
            <span className="block text-lg font-semibold whitespace-nowrap tabular-nums">~{minutesFor(questions.length)} мин</span>
            в своём темпе
          </li>
          <li className="rounded-xl bg-stone-100 px-3 py-2 dark:bg-stone-800">
            <span className="block text-lg font-semibold">
              {perLevel[0]?.level}–{perLevel[perLevel.length - 1]?.level}
            </span>
            {perLevel.length} этапа
          </li>
        </ul>
        <p className="text-sm text-stone-500">
          Этапы по уровням: {perLevel.map((l) => `${l.level} (${l.n})`).join(' → ')}. Если уровень даётся тяжело (меньше{' '}
          {Math.round(STOP_THRESHOLD * 100)}% верных), можно остановиться — следующие уровни останутся неоценёнными.
          <span className="hidden sm:inline"> Клавиатура: 1–9 — выбор варианта, Enter — проверить / дальше.</span>
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-primary" onClick={start} autoFocus>
            {last ? 'Пройти заново' : 'Начать'}
          </button>
          <Link to="/syllabus" className="btn-secondary no-underline">
            К курсу
          </Link>
        </div>
      </section>

      {last && (
        <section className="card space-y-3 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2>Последний результат</h2>
            <span className="text-sm text-stone-500">{formatDate(last.at)}</span>
          </div>
          <GradeCounts topics={last.topics} />
          {last.skippedLevels.length > 0 && (
            <p className="text-sm text-stone-500">Не оценивались: {last.skippedLevels.join(', ')}</p>
          )}
          <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => setPhase({ kind: 'last' })}>
            Карта тем и маршрут
          </button>
        </section>
      )}
      {!last && settings?.lastDiagnosticAt && (
        <p className="text-center text-sm text-stone-500">Последняя диагностика: {formatDate(settings.lastDiagnosticAt)}</p>
      )}
    </div>
  )
}

function StageDots({ stages, current }: { stages: Stage[]; current: number }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Этапы">
      {stages.map((s, i) => (
        <li
          key={s.level}
          aria-current={i === current ? 'step' : undefined}
          className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${
            i < current
              ? 'bg-brand-100 text-brand-800 dark:bg-brand-800/40 dark:text-brand-100'
              : i === current
                ? 'bg-brand-700 text-white'
                : 'bg-stone-200 text-stone-500 dark:bg-stone-800'
          }`}
        >
          {s.level}
        </li>
      ))}
    </ol>
  )
}

function Interstitial(p: {
  level: Level
  nextLevel: Level
  correct: number
  total: number
  low: boolean
  stages: Stage[]
  current: number
  onContinue(): void
  onStop(): void
}) {
  const pct = p.total ? Math.round((p.correct / p.total) * 100) : 0
  const tone = pct >= 85 ? 'text-brand-700 dark:text-brand-500' : pct >= 60 ? 'text-amber-600' : 'text-red-600'
  const primaryRef = useRef<HTMLButtonElement>(null)
  useEffect(() => primaryRef.current?.focus({ preventScroll: true }), [])
  const remaining = p.stages.slice(p.current + 1).map((s) => s.level)

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex justify-end">
        <StageDots stages={p.stages} current={p.current + 1} />
      </div>
      <section className="card space-y-4 text-center sm:p-6">
        <p className="text-sm text-stone-500">
          Этап {p.current + 1} из {p.stages.length} завершён · уровень {p.level}
        </p>
        <p className={`text-5xl font-bold tabular-nums ${tone}`}>{pct}%</p>
        <p className="text-stone-600 dark:text-stone-400">
          Верно {p.correct} из {p.total}
        </p>
        {p.low ? (
          <p className="rounded-xl bg-amber-50 p-3 text-left text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            На уровне {p.level} много ошибок — уровень {p.nextLevel}, скорее всего, окажется слишком сложным. Можно
            остановиться: {remaining.join(', ')} останутся неоценёнными, а маршрут построится по пройденным уровням.
          </p>
        ) : (
          <p className="text-sm text-stone-500">Следующий этап — уровень {p.nextLevel}.</p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          {p.low ? (
            <>
              <button ref={primaryRef} type="button" className="btn-primary" onClick={p.onStop}>
                Остановить здесь
              </button>
              <button type="button" className="btn-secondary" onClick={p.onContinue}>
                Продолжить: {p.nextLevel}
              </button>
            </>
          ) : (
            <button ref={primaryRef} type="button" className="btn-primary" onClick={p.onContinue}>
              Дальше: уровень {p.nextLevel} →
            </button>
          )}
        </div>
        {!p.low && (
          <button type="button" className="text-sm text-stone-500 underline-offset-2 hover:underline" onClick={p.onStop}>
            Завершить сейчас ({remaining.join(', ')} не будут оценены)
          </button>
        )}
      </section>
    </div>
  )
}
