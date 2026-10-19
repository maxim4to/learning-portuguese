import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronDown, Plus, RotateCcw } from 'lucide-react'
import type { Exercise, Topic } from '@/content'
import { useRepository, type TopicStatus } from '@/data'
import { ButtonLink } from '@/components/Button'
import { AzulejoCorner } from '@/components/Card'
import { ProgressRing } from '@/components/ProgressRing'
import { toneForPct } from '@/components/tones'
import { StatusBadge } from '@/components/StatusBadge'
import { exerciseFront, type RunSummary } from '@/features/exercises'
import { AddExamplesButton } from './ExamplesSection'
import type { SaveOutcome } from './persist'

export interface ResultScreenProps {
  /** Grammar topic: enables «добавить примеры в повторение». Omit for situations. */
  topic?: Topic
  /** Label before the status badges. Default «Статус темы:». */
  statusLabel?: string
  /** Final link. Default «К курсу» → /syllabus. */
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
  next?: { label: string; onClick(): void }
}

function headline(pct: number) {
  if (pct >= 85) return 'Отлично!'
  if (pct >= 60) return 'Хороший результат'
  if (pct > 0) return 'Есть над чем поработать'
  return 'Начало положено'
}

/** «Не знаю» answers: cards are created only when the learner asks. */
function PendingCards({ outcome }: { outcome: SaveOutcome }) {
  const repo = useRepository()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const doneRef = useRef<HTMLSpanElement>(null)
  const n = outcome.pendingCards.length
  // The button unmounts on success: keep keyboard focus here instead of dropping it to <body>.
  useEffect(() => {
    if (state === 'done') doneRef.current?.focus()
  }, [state])
  if (!n) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-control bg-surface-2 px-3 py-2.5 text-sm">
      <span className="text-ink-muted">«Не знаю»: {n} — добавить в повторение?</span>
      {state === 'done' ? (
        <span ref={doneRef} tabIndex={-1} role="status" className="inline-flex items-center gap-1 font-semibold text-brand-ink outline-none">
          <Check aria-hidden className="size-4" /> Добавлено
        </span>
      ) : (
        <button
          type="button"
          className="btn-secondary min-h-10 px-3 text-sm"
          disabled={state === 'busy'}
          onClick={() => {
            setState('busy')
            repo
              .upsertCards(outcome.pendingCards)
              .then(() => setState('done'))
              .catch(() => setState('error'))
          }}
        >
          <Plus aria-hidden className="size-4" /> Добавить ({n})
        </button>
      )}
      {state === 'error' && <span className="text-danger">Не удалось сохранить</span>}
    </div>
  )
}

/** Result: ring → actions (first screen on mobile) → collapsed list of mistakes with labelled rows. */
export function ResultScreen(p: ResultScreenProps) {
  const { summary, outcome } = p
  const pct = summary.total ? Math.round((summary.correct / summary.total) * 100) : 0
  const wrong = summary.answers.filter((a) => !a.ok)
  const byId = new Map(p.exercises.map((e) => [e.id, e]))
  const after = outcome?.progress?.status

  return (
    <div className="animate-enter space-y-4">
      <section className="card-raised relative isolate overflow-hidden rounded-hero p-6 text-center sm:p-10">
        {pct >= 60 && <AzulejoCorner seed={pct} />}
        <p className="text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
          {p.retry ? 'Работа над ошибками' : 'Результат'}
        </p>
        <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6 sm:text-left">
          <ProgressRing value={pct / 100} size={152} stroke={14} tone={toneForPct(pct)}>
            <span className="font-display text-[2.75rem] leading-none font-black tabular-nums" aria-hidden>
              {pct}%
            </span>
          </ProgressRing>
          <div className="space-y-1">
            <p className="font-display text-[2.25rem] leading-[0.95] sm:text-4xl">{headline(pct)}</p>
            <p className="text-ink-muted">
              <span className="sr-only">Результат: {pct} процентов, </span>Верно {summary.correct} из {summary.total}
            </p>
            {!p.retry && after && (
              <p className="flex flex-wrap items-center justify-center gap-2 pt-1 text-sm sm:justify-start">
                <span className="text-ink-muted">{p.statusLabel ?? 'Статус темы:'}</span>
                <StatusBadge status={p.before} />
                {after !== p.before && (
                  <>
                    <ArrowRight aria-label="стал" className="size-4 text-ink-muted" />
                    <StatusBadge status={after} className="animate-pop" />
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          {wrong.length > 0 && (
            <button type="button" className="btn-primary" onClick={p.onRetryWrong}>
              <RotateCcw aria-hidden className="size-5" /> Повторить ошибки ({wrong.length})
            </button>
          )}
          {p.next && (
            <button type="button" className={wrong.length ? 'btn-secondary' : 'btn-primary'} onClick={p.next.onClick}>
              {p.next.label}
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={p.onRestart}>
            Пройти заново
          </button>
          <ButtonLink to={p.back?.to ?? '/syllabus'} variant="ghost">
            {p.back?.label ?? 'К курсу'}
          </ButtonLink>
        </div>

        <div className="mt-4 space-y-2 text-sm" aria-live="polite">
          {p.saving && <p className="text-ink-muted">Сохраняю…</p>}
          {p.error && <p className="text-danger">Не удалось сохранить: {p.error}</p>}
          {p.retry && !p.saving && <p className="text-ink-muted">Повтор ошибок не меняет статус.</p>}
          {outcome && outcome.errorsLogged > 0 && (
            <p className="text-ink-muted">
              Ошибок в журнале: +{outcome.errorsLogged}
              {outcome.cardsAdded > 0 && <> · новых карточек на повторение: {outcome.cardsAdded}</>}
            </p>
          )}
          {outcome && <PendingCards outcome={outcome} />}
        </div>
      </section>

      {wrong.length > 0 && (
        <details className="group card p-0">
          <summary className="flex min-h-13 cursor-pointer list-none items-center gap-3 px-4 py-3 font-semibold select-none [&::-webkit-details-marker]:hidden">
            <span className="flex-1">Ошибки ({wrong.length})</span>
            <ChevronDown aria-hidden className="size-5 text-ink-muted transition-transform group-open:rotate-180" />
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {wrong.map((a) => {
              const ex = byId.get(a.exerciseId)
              const typed = ex?.type !== 'speak-shadow' && ex?.type !== 'match'
              return (
                <li key={a.exerciseId} className="space-y-1.5 px-4 py-3">
                  {ex && <p className="text-sm whitespace-pre-line text-ink-muted">{exerciseFront(ex)}</p>}
                  <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-0.5 text-[0.9375rem]">
                    {typed && (
                      <>
                        <dt className="text-ink-muted">Ваш ответ</dt>
                        <dd lang="pt-PT" className="min-w-0 break-words">
                          {a.skipped ? (
                            <span className="text-ink-muted italic" lang="ru">
                              не знаю
                            </span>
                          ) : (
                            <span className="text-danger line-through decoration-danger/50">{a.given || '—'}</span>
                          )}
                          {a.verdict === 'accents' && (
                            <span className="ml-2 text-warning" lang="ru">
                              (акценты)
                            </span>
                          )}
                        </dd>
                      </>
                    )}
                    <dt className="text-ink-muted">Верно</dt>
                    <dd lang="pt-PT" className="min-w-0 font-semibold break-words">
                      {a.expected}
                    </dd>
                  </dl>
                </li>
              )
            })}
          </ul>
        </details>
      )}

      {p.topic && <AddExamplesButton topic={p.topic} />}
    </div>
  )
}
