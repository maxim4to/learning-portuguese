import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, History, LogOut } from 'lucide-react'
import { plural } from '@/features/library/format'
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
          <h1 className="font-sans text-base font-bold">Диагностика</h1>
          <div className="flex items-center gap-2">
            <StageDots stages={stages} current={phase.stage} />
            <button
              type="button"
              className="btn-ghost btn-sm"
              ref={exitRef}
              aria-expanded={confirmExit}
              onClick={() => setConfirmExit((v) => !v)}
            >
              <LogOut aria-hidden /> Выйти
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
          className="btn-ghost btn-sm -ml-3 text-ink"
          onClick={() => setPhase({ kind: 'intro' })}
        >
          ← Назад
        </button>
        <DiagnosticResult data={last} heading="Последний результат" onRestart={start} />
      </div>
    )
  }

  // --- Intro -------------------------------------------------------------------
  // Desktop: how the test runs (main) beside what it covers / takes / gives (side panel); stacked on phones.
  const levelSpan = `${perLevel[0]?.level}–${perLevel[perLevel.length - 1]?.level}`
  return (
    <div className="page">
      <PageHeader
        back={{ to: '/syllabus', label: 'Курс' }}
        title="Диагностика уровня"
        subtitle="Короткий тест по грамматике европейского португальского: по 1–2 вопроса на каждую тему курса."
      />

      {saved && (
        <section className="card animate-enter flex flex-col gap-3 bg-azulejo-soft sm:flex-row sm:items-center">
          <History aria-hidden className="size-5 shrink-0 text-azulejo" />
          <p className="flex-1 text-sm">
            <b>Незаконченная диагностика.</b> Этап {saved.stage + 1} из {saved.stages.length} — можно продолжить с того же места.
          </p>
          <button type="button" className="btn-primary" onClick={resume} autoFocus>
            Продолжить
          </button>
        </section>
      )}

      <div className="page-grid">
        <section aria-labelledby="diag-how" className="card space-y-5">
          <h2 id="diag-how">Как проходит тест</h2>
          <ol className="divide-y divide-line">
            {perLevel.map((l, i) => (
              <li key={l.level} className="flex items-baseline gap-4 py-3">
                <span className="w-16 shrink-0 text-sm text-ink-muted tabular-nums">Этап {i + 1}</span>
                <span className="flex-1 font-semibold">Уровень {l.level}</span>
                <span className="text-sm text-ink-muted tabular-nums">{plural(l.n, 'вопрос', 'вопроса', 'вопросов')}</span>
              </li>
            ))}
          </ol>
          <p className="measure text-sm text-ink-muted">
            Если уровень даётся тяжело (меньше {Math.round(STOP_THRESHOLD * 100)}% верных), можно остановиться — следующие
            уровни останутся неоценёнными. Прогресс сохраняется, пока открыта вкладка.
            <span className="hidden sm:inline"> Клавиатура: 1–9 — выбор варианта, Enter — проверить / дальше.</span>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className={saved ? 'btn-secondary' : 'btn-primary'} onClick={start} autoFocus={!saved}>
              {saved ? 'Начать заново' : last ? 'Пройти заново' : 'Начать'}
              {!saved && <ArrowRight aria-hidden />}
            </button>
            <ButtonLink to="/syllabus" variant="ghost">
              К курсу
            </ButtonLink>
          </div>
        </section>

        <aside className="space-y-(--gutter)">
          <section aria-labelledby="diag-what" className="card space-y-4">
            <h2 id="diag-what">Что внутри</h2>
            <dl className="grid grid-cols-3 gap-3">
              <div className="flex flex-col-reverse justify-end">
                <dt className="text-sm text-ink-muted">вопросов</dt>
                <dd className="font-display text-h2 tabular-nums">{questions.length}</dd>
              </div>
              <div className="flex flex-col-reverse justify-end">
                <dt className="text-sm text-ink-muted">в своём темпе</dt>
                <dd className="font-display text-h2 whitespace-nowrap tabular-nums">~{minutesFor(questions.length)} мин</dd>
              </div>
              <div className="flex flex-col-reverse justify-end">
                <dt className="text-sm text-ink-muted">{plural(perLevel.length, 'этап', 'этапа', 'этапов')}</dt>
                <dd className="font-display text-h2">{levelSpan}</dd>
              </div>
            </dl>
            <h3 className="rule-dotted pt-4">Что вы получите</h3>
            <ul className="space-y-2 text-sm text-ink-muted">
              <li>Каждая тема курса получает статус «уверенно», «изучаю» или «слабо».</li>
              <li>Персональный маршрут: сначала темы, которые проседают.</li>
              <li>Ошибки попадают в журнал — их можно повторить карточками.</li>
            </ul>
          </section>

          {last ? (
            <section aria-labelledby="diag-last" className="card space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="diag-last">Последний результат</h2>
                <span className="text-sm text-ink-muted">{formatDate(last.at)}</span>
              </div>
              <GradeCounts topics={last.topics} />
              {last.skippedLevels.length > 0 && (
                <p className="text-sm text-ink-muted">Не оценивались: {last.skippedLevels.join(', ')}</p>
              ) }
              <button type="button" className="btn-secondary w-full" onClick={() => setPhase({ kind: 'last' })}>
                Карта тем и маршрут
              </button>
            </section>
          ) : (
            <p className="px-1 text-sm text-ink-muted">
              {settings?.lastDiagnosticAt
                ? `Последняя диагностика: ${formatDate(settings.lastDiagnosticAt)}.`
                : 'Вы ещё не проходили диагностику — результат появится здесь.'}
            </p>
          )}
        </aside>
      </div>
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
    <div className="page-grid">
    <div className="min-w-0 space-y-4">
      <div className="flex justify-end">
        <StageDots stages={p.stages} current={p.current + 1} />
      </div>
      <section className="card-raised animate-enter space-y-4 text-center">
        <p className="text-sm text-ink-muted">
          Этап {p.current + 1} из {p.stages.length} завершён · уровень {p.level}
        </p>
        <div className="flex justify-center">
          <ProgressRing value={pct / 100} size={120} stroke={10} tone={toneForPct(pct)}>
            <span className="font-display text-h2 tabular-nums">{pct}%</span>
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
          <button type="button" className="btn-ghost btn-sm" onClick={p.onStop}>
            Завершить сейчас ({remaining.join(', ')} не будут оценены)
          </button>
        )}
      </section>
    </div>
    <StageList stages={p.stages} done={p.current + 1} />
    </div>
  )
}

/** Side panel between stages: which levels are done and which are left. */
function StageList({ stages, done }: { stages: Stage[]; done: number }) {
  return (
    <aside aria-labelledby="diag-stages" className="card space-y-3">
      <h2 id="diag-stages">Этапы</h2>
      <ol className="divide-y divide-line text-sm">
        {stages.map((s, i) => (
          <li key={s.level} className="flex items-baseline justify-between gap-3 py-2">
            <span className="font-semibold">
              Этап {i + 1} · {s.level}
            </span>
            <span className="text-ink-muted">
              {i < done ? 'пройден' : `${plural(s.questions.length, 'вопрос', 'вопроса', 'вопросов')}`}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  )
}
