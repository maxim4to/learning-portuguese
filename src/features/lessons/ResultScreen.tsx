import { Link } from 'react-router-dom'
import type { Exercise, Topic } from '@/content'
import type { TopicStatus } from '@/data'
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

export function ResultScreen(p: ResultScreenProps) {
  const { summary, outcome } = p
  const pct = summary.total ? Math.round((summary.correct / summary.total) * 100) : 0
  const wrong = summary.answers.filter((a) => !a.ok)
  const byId = new Map(p.exercises.map((e) => [e.id, e]))
  const after = outcome?.progress?.status
  const tone = pct >= 85 ? 'text-brand-700 dark:text-brand-500' : pct >= 60 ? 'text-amber-600' : 'text-red-600'

  return (
    <div className="space-y-4">
      <section className="card space-y-3 text-center sm:p-6">
        <p className="text-sm text-stone-500">{p.retry ? 'Работа над ошибками' : 'Результат'}</p>
        <p className={`text-5xl font-bold tabular-nums ${tone}`}>{pct}%</p>
        <p className="text-stone-600 dark:text-stone-400">
          Верно {summary.correct} из {summary.total}
        </p>
        {p.saving && <p className="text-sm text-stone-500">Сохраняю…</p>}
        {p.error && <p className="text-sm text-red-600">Не удалось сохранить: {p.error}</p>}
        {!p.retry && after && (
          <p className="flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="text-stone-500">{p.statusLabel ?? 'Статус темы:'}</span>
            <StatusBadge status={p.before} />
            {after !== p.before && (
              <>
                <span aria-hidden>→</span>
                <StatusBadge status={after} />
              </>
            )}
          </p>
        )}
        {p.retry && !p.saving && <p className="text-sm text-stone-500">Повтор ошибок не меняет статус.</p>}
        {outcome && outcome.errorsLogged > 0 && (
          <p className="text-sm text-stone-500">
            Ошибок в журнале: +{outcome.errorsLogged}
            {outcome.cardsAdded > 0 && <> · новых карточек на повторение: {outcome.cardsAdded}</>}
          </p>
        )}
      </section>

      {wrong.length > 0 && (
        <section className="card space-y-3">
          <h3>Ошибки</h3>
          <ul className="divide-y divide-stone-200 dark:divide-stone-800">
            {wrong.map((a) => {
              const ex = byId.get(a.exerciseId)
              return (
                <li key={a.exerciseId} className="space-y-0.5 py-2.5 first:pt-0 last:pb-0">
                  {ex && <p className="text-sm whitespace-pre-line text-stone-500">{exerciseFront(ex)}</p>}
                  {ex?.type !== 'speak-shadow' && ex?.type !== 'match' && (
                    <p className="text-sm">
                      <span className="text-red-700 line-through decoration-red-400 dark:text-red-400" lang="pt-PT">
                        {a.given || '—'}
                      </span>
                      {a.verdict === 'accents' && <span className="ml-2 text-amber-700">(акценты)</span>}
                    </p>
                  )}
                  <p className="font-medium" lang="pt-PT">
                    {a.expected}
                  </p>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {wrong.length > 0 && (
          <button type="button" className="btn-primary" onClick={p.onRetryWrong}>
            Повторить ошибки ({wrong.length})
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
        <Link to={p.back?.to ?? '/syllabus'} className="btn-secondary no-underline">
          {p.back?.label ?? 'К курсу'}
        </Link>
      </div>
      {p.topic && <AddExamplesButton topic={p.topic} />}
    </div>
  )
}
