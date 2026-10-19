import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight, Plus, RotateCcw } from 'lucide-react'
import type { Exercise } from '@/content'
import { useRepository, type SrsCard, type TopicStatus } from '@/data'
import { ProgressRing } from '@/components/ProgressRing'
import { toneForPct } from '@/components/tones'
import { LevelBadge, StatusBadge } from '@/components/StatusBadge'
import { exerciseFront, type RunSummary } from '@/features/exercises'
import { isInHiddenPanel, noMods, revealIfOffscreen } from '@/features/exercises/keyboard'
import { AddCardButton } from '@/features/library/ui'
import { cardsFromErrors, errorCardId } from '@/features/srs/cardOps'
import { isLookupOpen } from '@/features/words/capture'
import { lookupAttrs } from '@/features/words/source'
import { recReason, type TopicRec } from './nextSteps'
import type { SaveOutcome } from './persist'

/** The screen's one forward action: a route (`to`) or an in-page step (`onClick`). */
export interface PrimaryAction {
  label: ReactNode
  to?: string
  onClick?(): void
  icon?: ReactNode
}

export interface ResultScreenProps {
  /** What was run, for the heading: «Упражнения пройдены», «Мини-тест», «Вопросы к тексту». Default «Результат». */
  runTitle?: string
  /** Label before the status badges. Default «Статус темы:». */
  statusLabel?: string
  /** Quiet link back. Default «К курсу» → /syllabus. */
  back?: { to: string; label: string }
  summary: RunSummary
  exercises: readonly Exercise[]
  retry: boolean
  before: TopicStatus
  saving: boolean
  outcome?: SaveOutcome
  error?: string
  onRetryWrong(): void
  onRestart(): void
  /** The logical next step. Default: mistakes first when the result is low, then `next`, then `back`. */
  primary?: PrimaryAction
  /** Forward step inside the page (situations: the next tab); used by the default primary. */
  next?: { label: string; onClick(): void }
  /** «Что дальше»: recommended topics with a reason. */
  recs?: readonly TopicRec[]
}

function verdict(pct: number) {
  if (pct >= 85) return 'Материал усвоен уверенно.'
  if (pct >= 60) return 'Почти: ещё немного практики — и будет уверенно.'
  if (pct > 0) return 'Пока трудно — стоит закрепить.'
  return 'Начало положено.'
}

/** Ignore a keyboard «click» on the primary this soon after the screen appears (held / bounced Enter from «Завершить»). */
const BOUNCE_MS = 450
/** Mistakes listed before «Показать все». */
const SHOWN = 6

/**
 * End of a run: the result in plain words (heading, status change) → one primary next step + quiet secondary
 * actions → «Работа над ошибками» (only when there were mistakes) and «Что дальше» (recommended topics).
 * Keyboard: the primary is focused; Enter anywhere outside a control triggers it.
 */
export function ResultScreen(p: ResultScreenProps) {
  const { summary, outcome } = p
  const pct = summary.total ? Math.round((summary.correct / summary.total) * 100) : 0
  const wrong = summary.answers.filter((a) => !a.ok)
  const after = outcome?.progress?.status
  const back = p.back ?? { to: '/syllabus', label: 'К курсу' }

  const retryAction: PrimaryAction = {
    label: `Повторить ошибки (${wrong.length})`,
    onClick: p.onRetryWrong,
    icon: <RotateCcw />,
  }
  const primary: PrimaryAction =
    p.primary ??
    (wrong.length && (pct < 60 || !p.next)
      ? retryAction
      : p.next
        ? { label: p.next.label, onClick: p.next.onClick }
        : { label: back.label, to: back.to })
  const primaryIsRetry = primary.onClick === p.onRetryWrong
  const primaryIsBack = primary.to === back.to

  const rootRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement & HTMLAnchorElement>(null)
  const [mountedAt] = useState(() => Date.now())

  // Focus lands on the primary action (not when this result sits in a hidden tab panel).
  useEffect(() => {
    const el = primaryRef.current
    if (!el || isInHiddenPanel(rootRef.current)) return
    el.focus({ preventScroll: true })
    revealIfOffscreen(el)
  }, [])

  // Enter outside any control → the primary action. Attached on the next tick so the Enter that finished the run
  // doesn't also fire it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isLookupOpen()) return // Enter belongs to the word card while it is open
      if (e.key !== 'Enter' || e.repeat || e.isComposing || !noMods(e)) return
      if (isInHiddenPanel(rootRef.current)) return
      const t = e.target as HTMLElement | null
      if (t?.closest('button, a, input, textarea, select, summary, [role="dialog"], dialog, [contenteditable="true"]')) return
      e.preventDefault()
      primaryRef.current?.click()
    }
    const timer = setTimeout(() => window.addEventListener('keydown', onKey), 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const guard = (e: MouseEvent) => {
    if (e.detail === 0 && Date.now() - mountedAt < BOUNCE_MS) {
      e.preventDefault()
      return true
    }
    return false
  }

  const title = p.retry
    ? `Ошибки повторены: ${summary.correct} из ${summary.total}`
    : `${p.runTitle ?? 'Результат'}: ${summary.correct} из ${summary.total}`

  const primaryContent = (
    <>
      {primary.icon && <span aria-hidden className="-ml-0.5 inline-flex shrink-0">{primary.icon}</span>}
      <span className="min-w-0 text-balance">{primary.label}</span>
      {!primary.icon && <ArrowRight aria-hidden className="-mr-0.5 size-[1.125rem] shrink-0" />}
    </>
  )

  const quiet = 'btn-ghost btn-sm'
  // A long next-topic title wraps instead of being cut off on phones.
  const primaryCls = 'btn-primary h-auto min-h-11 max-w-full py-2.5 text-center whitespace-normal'
  const hasRecs = !!p.recs?.length

  return (
    <div
      ref={rootRef}
      className={hasRecs ? 'grid animate-enter items-start gap-(--gutter) lg:grid-cols-[minmax(0,1fr)_22rem]' : 'animate-enter space-y-4'}
    >
      <section aria-labelledby="result-title" className="card-raised min-w-0 lg:col-start-1 lg:row-start-1">
        <div className="flex items-center gap-4 sm:gap-6">
          <ProgressRing value={pct / 100} size={96} stroke={10} tone={toneForPct(pct)} className="shrink-0 max-sm:hidden">
            <span className="font-display text-h2 leading-none tabular-nums" aria-hidden>
              {pct}%
            </span>
          </ProgressRing>
          <div className="min-w-0 space-y-2">
            <h2 id="result-title" className="text-h1 text-balance">
              {title}
              <span className="sm:hidden text-ink-muted"> · {pct}%</span>
            </h2>
            <p className="text-ink-muted">{p.retry ? 'Повтор ошибок не меняет статус.' : verdict(pct)}</p>
            {!p.retry && after && (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-ink-muted">{p.statusLabel ?? 'Статус темы:'}</span>
                {after !== p.before && (
                  <>
                    <StatusBadge status={p.before} />
                    <ArrowRight aria-label="стал" className="size-4 text-ink-muted" />
                  </>
                )}
                <StatusBadge status={after} className={after !== p.before ? 'animate-pop' : undefined} />
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {primary.to ? (
            <Link ref={primaryRef} to={primary.to} className={primaryCls} onClick={(e) => guard(e)}>
              {primaryContent}
            </Link>
          ) : (
            <button
              ref={primaryRef}
              type="button"
              className={primaryCls}
              onClick={(e) => {
                if (!guard(e)) primary.onClick?.()
              }}
            >
              {primaryContent}
            </button>
          )}
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 sm:ml-2">
            {wrong.length > 0 && !primaryIsRetry && (
              <button type="button" className={quiet} onClick={p.onRetryWrong}>
                <RotateCcw aria-hidden className="size-4" /> Повторить ошибки ({wrong.length})
              </button>
            )}
            <button type="button" className={quiet} onClick={p.onRestart}>
              Пройти заново
            </button>
            {!primaryIsBack && (
              <Link to={back.to} className={quiet}>
                {back.label}
              </Link>
            )}
          </div>
        </div>

        {(p.saving || p.error) && (
          <p className="mt-3 text-sm" aria-live="polite">
            {p.saving && <span className="text-ink-muted">Сохраняю…</span>}
            {p.error && <span className="text-danger">Не удалось сохранить: {p.error}</span>}
          </p>
        )}
      </section>

      {hasRecs && <NextList recs={p.recs!} />}

      {wrong.length > 0 && (
        <Mistakes wrong={wrong} exercises={p.exercises} outcome={outcome} saving={p.saving} />
      )}
    </div>
  )
}

/** «Что дальше»: 2–3 topic rows with the reason, the same rows as the dashboard's «Дальше по курсу». */
function NextList({ recs }: { recs: readonly TopicRec[] }) {
  return (
    <aside aria-labelledby="result-next" className="card space-y-3 lg:col-start-2 lg:row-span-2 lg:row-start-1">
      <h2 id="result-next">Что дальше</h2>
      <ul className="space-y-2">
        {recs.map((r) => (
          <li key={r.topic.id} className="flex">
            <Link
              to={`/topic/${r.topic.id}`}
              className="group flex min-h-16 flex-1 items-center gap-3 rounded-control bg-surface-2 px-4 py-3 text-ink no-underline transition-[background-color,transform] duration-150 hover:bg-sunken/60 active:scale-[0.99] motion-reduce:transition-none"
            >
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 leading-snug font-semibold">{r.topic.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
                  <LevelBadge level={r.topic.level} />
                  {recReason(r)}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}

/**
 * «Работа над ошибками»: each mistake with the right answer and its review state. Ordinary mistakes are already
 * cards (saveRun adds them); «Не знаю» answers are added one by one (or all at once) on request.
 */
function Mistakes({
  wrong,
  exercises,
  outcome,
  saving,
}: {
  wrong: RunSummary['answers']
  exercises: readonly Exercise[]
  outcome?: SaveOutcome
  saving: boolean
}) {
  const repo = useRepository()
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])
  const [have, setHave] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [all, setAll] = useState(wrong.length <= SHOWN)
  const shown = all ? wrong : wrong.slice(0, SHOWN)

  useEffect(() => {
    if (saving) return
    let alive = true
    repo
      .getCards()
      .then((cs) => alive && setHave(new Set(cs.map((c) => c.id))))
      .catch(() => alive && setHave(new Set()))
    return () => {
      alive = false
    }
  }, [repo, saving, outcome])

  const pending = useMemo(() => new Map((outcome?.pendingCards ?? []).map((c) => [c.exerciseId, c])), [outcome])
  const reviewable = (a: RunSummary['answers'][number]) => byId.get(a.exerciseId)?.type !== 'speak-shadow'
  const cardFor = (a: RunSummary['answers'][number]): SrsCard | undefined =>
    pending.get(a.exerciseId) ??
    cardsFromErrors([{ id: '', exerciseId: a.exerciseId, topicId: a.topicId, given: a.given, expected: a.expected, at: Date.now() }], [])[0]
  const missing = have ? wrong.filter((a) => reviewable(a) && !have.has(errorCardId(a.exerciseId))) : []

  async function add(list: RunSummary['answers']) {
    const cards = list.map(cardFor).filter((c): c is SrsCard => !!c)
    if (!cards.length) return
    setBusy(true)
    try {
      await repo.upsertCards(cards)
      setHave((h) => new Set([...(h ?? []), ...cards.map((c) => c.id)]))
      setMsg(cards.length > 1 ? `Добавлено в повторение: ${cards.length}` : 'Добавлено в повторение')
    } catch (e) {
      setMsg(`Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="result-mistakes" className="card min-w-0 space-y-3 p-0 lg:col-start-1 lg:row-start-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 pt-5 lg:px-6 lg:pt-6">
        <div className="space-y-1">
          <h2 id="result-mistakes">Работа над ошибками · {wrong.length}</h2>
          <p className="text-sm text-ink-muted">
            {missing.length ? 'Ошибки уже в повторении, «Не знаю» — добавьте сами.' : 'Все ошибки в повторении.'}
          </p>
        </div>
        {missing.length > 1 && (
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void add(missing)}>
            <Plus aria-hidden className="size-4" /> Добавить все ({missing.length})
          </button>
        )}
      </div>
      {msg && (
        <p role="status" className="px-5 text-sm text-ink-muted lg:px-6">
          {msg}
        </p>
      )}
      <ul className="divide-y divide-line border-t border-line">
        {shown.map((a) => {
          const ex = byId.get(a.exerciseId)
          const typed = ex?.type !== 'speak-shadow' && ex?.type !== 'match'
          return (
            <li
              key={a.exerciseId}
              className="flex items-start gap-3 py-3 pr-2 pl-5 lg:pl-6"
              {...lookupAttrs({ src: { kind: 'exercise', id: a.exerciseId, part: 'feedback' } })}
            >
              <div className="min-w-0 flex-1 space-y-1">
                {ex && <p className="line-clamp-3 text-sm whitespace-pre-line text-ink-muted">{exerciseFront(ex)}</p>}
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span lang="pt-PT" className="min-w-0 font-semibold break-words">
                    <span className="sr-only" lang="ru">Верно: </span>
                    {a.expected}
                  </span>
                  {typed && (
                    <span className="min-w-0 text-sm break-words">
                      {a.skipped ? (
                        <span className="text-ink-muted italic">не знаю</span>
                      ) : (
                        <>
                          <span className="sr-only">Ваш ответ: </span>
                          <span lang="pt-PT" className="text-danger line-through decoration-danger/50">
                            {a.given || '—'}
                          </span>
                          {a.verdict === 'accents' && <span className="ml-2 text-warning">(акценты)</span>}
                        </>
                      )}
                    </span>
                  )}
                </p>
              </div>
              {reviewable(a) && (
                <AddCardButton
                  variant="text"
                  name={a.expected}
                  added={!!have?.has(errorCardId(a.exerciseId))}
                  disabled={busy || have === null}
                  onClick={() => void add([a])}
                />
              )}
            </li>
          )
        })}
      </ul>
      {!all && (
        <div className="border-t border-line px-3 py-1.5 lg:px-4">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setAll(true)}>
            Показать все ({wrong.length})
          </button>
        </div>
      )}
    </section>
  )
}
