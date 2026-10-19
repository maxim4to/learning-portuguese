import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ClipboardCheck, History, LogOut } from 'lucide-react'
import { LEVELS, getDiagnostic, type DiagnosticQuestion, type Level } from '@/content'
import { ButtonLink } from '@/components/Button'
import { PageHeader } from '@/components/PageHeader'
import { ProgressRing } from '@/components/ProgressRing'
import { toneForPct } from '@/components/tones'
import { cx } from '@/components/cx'
import { clearRun } from '@/features/exercises/runPersist'
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

/** In-progress diagnostic (stages + finished stage results), kept for the tab session so a reload resumes. */
interface DiagSnapshot {
  stages: { level: Level; ids: string[] }[]
  results: RunSummary[]
  stage: number
  between: boolean
}
const DIAG_KEY = 'ptpt:v1:diagnostic'
function loadDiag(questions: readonly DiagnosticQuestion[]): { stages: Stage[]; results: RunSummary[]; stage: number; between: boolean } | null {
  try {
    const raw = sessionStorage.getItem(DIAG_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as DiagSnapshot
    const byId = new Map(questions.map((q) => [q.id, q]))
    const stages = s.stages.map((st) => ({ level: st.level, questions: st.ids.map((id) => byId.get(id)!) }))
    if (stages.some((st) => st.questions.some((q) => !q))) return null
    return { stages, results: s.results, stage: s.stage, between: s.between }
  } catch {
    return null
  }
}
function saveDiag(stages: Stage[], results: RunSummary[], stage: number, between: boolean) {
  try {
    const snap: DiagSnapshot = { stages: stages.map((st) => ({ level: st.level, ids: st.questions.map((q) => q.id) })), results, stage, between }
    sessionStorage.setItem(DIAG_KEY, JSON.stringify(snap))
  } catch {
    // ignore
  }
}
function clearDiag(stageCount = 8) {
  try {
    sessionStorage.removeItem(DIAG_KEY)
  } catch {
    // ignore
  }
  for (let i = 0; i < stageCount; i++) clearRun(`diag:${i}`)
}

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
  const [saved, setSaved] = useState(() => loadDiag(questions))
  const [confirmExit, setConfirmExit] = useState(false)
  const exitRef = useRef<HTMLButtonElement>(null)

  // Persist the run between stages / questions (cleared on finish or exit).
  useEffect(() => {
    if (phase.kind === 'run' || phase.kind === 'between') saveDiag(stages, results, phase.stage, phase.kind === 'between')
  }, [phase, stages, results])

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

  function resume() {
    if (!saved) return
    setStages(saved.stages)
    setResults(saved.results)
    setPhase(saved.between ? { kind: 'between', stage: saved.stage } : { kind: 'run', stage: saved.stage })
    setSaved(null)
  }

  function exit() {
    clearDiag(stages.length)
    setConfirmExit(false)
    setSaved(null)
    setPhase({ kind: 'intro' })
  }

  function start() {
    clearDiag(stages.length || 8)
    setSaved(null)
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
    clearDiag(usedStages.length)
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
          <h1 className="font-sans text-xl font-bold">Диагностика</h1>
          <div className="flex items-center gap-2">
            <StageDots stages={stages} current={phase.stage} />
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2.5 text-sm font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink"
              ref={exitRef}
              aria-expanded={confirmExit}
              onClick={() => setConfirmExit((v) => !v)}
            >
              <LogOut aria-hidden className="size-4" /> Выйти
            </button>
          </div>
        </div>
        {confirmExit && (
          <div role="alertdialog" aria-labelledby="diag-exit-t" className="card animate-enter space-y-3 border-warning-line bg-warning-soft">
            <p id="diag-exit-t" className="font-semibold">
              Прервать диагностику?
            </p>
            <p className="text-sm text-ink-muted">
              Ответы этого прохода не сохранятся. Если просто нужно отвлечься — оставьте вкладку открытой: прогресс
              держится до закрытия вкладки, даже после перезагрузки.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-danger" onClick={exit}>
                Прервать
              </button>
              <button
                type="button"
                className="btn-secondary"
                autoFocus
                onClick={() => {
                  setConfirmExit(false)
                  exitRef.current?.focus() // the dialog unmounts with this button
                }}
              >
                Продолжить тест
              </button>
            </div>
          </div>
        )}
        <ExerciseRunner
          key={`${runId}:${phase.stage}`}
          exercises={stage.questions}
          title={`Этап ${phase.stage + 1} из ${stages.length} · уровень ${stage.level}`}
          persistKey={`diag:${phase.stage}`}
          onFinish={onStageFinish}
          focusOnMount
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
        <button
          type="button"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-sm font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink"
          onClick={() => setPhase({ kind: 'intro' })}
        >
          ← Назад
        </button>
        <DiagnosticResult data={last} heading="Последний результат" onRestart={start} />
      </div>
    )
  }

  // --- Intro -------------------------------------------------------------------
  const stat = 'card-sunken px-3 py-3'
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader back={{ to: '/syllabus', label: 'Курс' }} eyebrow="Проверка уровня" title="Диагностика" />

      {saved && (
        <section className="card animate-enter flex flex-col gap-3 border-azulejo/30 bg-azulejo-soft sm:flex-row sm:items-center">
          <History aria-hidden className="size-6 shrink-0 text-azulejo" />
          <p className="flex-1 text-sm">
            <b>Незаконченная диагностика.</b> Этап {saved.stage + 1} из {saved.stages.length} — можно продолжить с того же места.
          </p>
          <button type="button" className="btn-primary" onClick={resume} autoFocus>
            Продолжить
          </button>
        </section>
      )}

      <section className="card-raised relative space-y-5 overflow-hidden rounded-hero p-5 sm:p-7">
        <div className="flex items-start gap-4">
          <span aria-hidden className="hidden size-12 shrink-0 place-items-center rounded-2xl bg-azulejo-soft text-azulejo sm:grid">
            <ClipboardCheck className="size-6" />
          </span>
          <p className="text-ink">
            Короткий тест по грамматике европейского португальского: по 1–2 вопроса на каждую тему курса. По результату
            темы окрашиваются в зелёный, жёлтый или красный, и вы получаете персональный маршрут — сначала то, что
            проседает.
          </p>
        </div>
        <ul className="grid grid-cols-3 gap-2 text-sm leading-tight text-ink-muted">
          <li className={stat}>
            <span className="block font-serif text-2xl font-semibold text-ink tabular-nums">{questions.length}</span>
            вопросов
          </li>
          <li className={stat}>
            <span className="block font-serif text-2xl font-semibold whitespace-nowrap text-ink tabular-nums">
              ~{minutesFor(questions.length)} мин
            </span>
            в своём темпе
          </li>
          <li className={stat}>
            <span className="block font-serif text-2xl font-semibold text-ink">
              {perLevel[0]?.level}–{perLevel[perLevel.length - 1]?.level}
            </span>
            {perLevel.length} этапа
          </li>
        </ul>
        <p className="text-sm text-ink-muted">
          Этапы по уровням: {perLevel.map((l) => `${l.level} (${l.n})`).join(' → ')}. Если уровень даётся тяжело (меньше{' '}
          {Math.round(STOP_THRESHOLD * 100)}% верных), можно остановиться — следующие уровни останутся неоценёнными.
          Прогресс сохраняется, пока открыта вкладка.
          <span className="hidden sm:inline"> Клавиатура: 1–9 — выбор варианта, Enter — проверить / дальше.</span>
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className={saved ? 'btn-secondary' : 'btn-primary'} onClick={start} autoFocus={!saved}>
            {saved ? 'Начать заново' : last ? 'Пройти заново' : 'Начать'}
            {!saved && <ArrowRight aria-hidden className="size-5" />}
          </button>
          <ButtonLink to="/syllabus" variant="ghost">
            К курсу
          </ButtonLink>
        </div>
      </section>

      {last && (
        <section className="card space-y-3 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2>Последний результат</h2>
            <span className="text-sm text-ink-muted">{formatDate(last.at)}</span>
          </div>
          <GradeCounts topics={last.topics} />
          {last.skippedLevels.length > 0 && (
            <p className="text-sm text-ink-muted">Не оценивались: {last.skippedLevels.join(', ')}</p>
          )}
          <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => setPhase({ kind: 'last' })}>
            Карта тем и маршрут
          </button>
        </section>
      )}
      {!last && settings?.lastDiagnosticAt && (
        <p className="text-center text-sm text-ink-muted">Последняя диагностика: {formatDate(settings.lastDiagnosticAt)}</p>
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
          className={cx(
            'rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums',
            i < current ? 'bg-brand-soft text-brand-ink' : i === current ? 'bg-brand text-on-brand' : 'bg-surface-2 text-ink-muted',
          )}
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
  const primaryRef = useRef<HTMLButtonElement>(null)
  useEffect(() => primaryRef.current?.focus({ preventScroll: true }), [])
  const remaining = p.stages.slice(p.current + 1).map((s) => s.level)

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex justify-end">
        <StageDots stages={p.stages} current={p.current + 1} />
      </div>
      <section className="card-raised animate-enter space-y-4 rounded-hero p-5 text-center sm:p-7">
        <p className="text-sm text-ink-muted">
          Этап {p.current + 1} из {p.stages.length} завершён · уровень {p.level}
        </p>
        <div className="flex justify-center">
          <ProgressRing value={pct / 100} size={120} stroke={10} tone={toneForPct(pct)}>
            <span className="font-serif text-3xl font-semibold tabular-nums">{pct}%</span>
          </ProgressRing>
        </div>
        <p className="text-ink-muted">
          Верно {p.correct} из {p.total}
        </p>
        {p.low ? (
          <p className="rounded-control bg-warning-soft p-3 text-left text-sm text-ink">
            На уровне {p.level} много ошибок — уровень {p.nextLevel}, скорее всего, окажется слишком сложным. Можно
            остановиться: {remaining.join(', ')} останутся неоценёнными, а маршрут построится по пройденным уровням.
          </p>
        ) : (
          <p className="text-sm text-ink-muted">Следующий этап — уровень {p.nextLevel}.</p>
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
          <button type="button" className="min-h-11 text-sm text-ink-muted underline-offset-2 hover:underline" onClick={p.onStop}>
            Завершить сейчас ({remaining.join(', ')} не будут оценены)
          </button>
        )}
      </section>
    </div>
  )
}
