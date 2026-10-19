import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { ButtonLink } from '@/components/Button'
import { getDiagnostic, getSyllabus, getTopic } from '@/content'
import { LevelBadge } from '@/components/StatusBadge'
import { Illustration } from '@/components/Illustration'
import { levelArt } from '@/components/illustrations'
import {
  GRADE_META,
  countGrades,
  formatDate,
  gradeOf,
  recommendedRoute,
  topicTitle,
  type DiagnosticResultData,
  type Grade,
  type TopicOutcome,
} from './plan'

/** Route items shown before «Показать все». */
const ROUTE_PREVIEW = 10

const LEGEND: Grade[] = ['green', 'yellow', 'red', 'none']

/** Green / yellow / red counters. */
export function GradeCounts({ topics }: { topics: Map<string, TopicOutcome> }) {
  const c = countGrades(topics)
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      {(['green', 'yellow', 'red'] as const).map((g) => (
        <div key={g} className={`rounded-control border px-2 py-3 ${GRADE_META[g].chip}`}>
          <p className="font-display text-h2 tabular-nums">{c[g]}</p>
          <p className="text-xs font-semibold">{GRADE_META[g].label}</p>
        </div>
      ))}
    </div>
  )
}

function TopicChip({ id, outcome }: { id: string; outcome?: TopicOutcome }) {
  const g = gradeOf(outcome)
  const meta = GRADE_META[g]
  return (
    <li>
      <Link
        to={`/topic/${id}`}
        className={`flex min-h-11 items-center gap-2 rounded-control border px-3 py-1.5 text-sm no-underline transition-colors ${meta.chip}`}
        title={meta.label}
      >
        <i className={`size-2.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
        <span className="min-w-0 flex-1 leading-snug">{topicTitle(id)}</span>
        <span className="shrink-0 text-xs font-semibold tabular-nums">
          {outcome ? `${outcome.correct}/${outcome.total}` : '—'}
          <span className="sr-only"> · {meta.label}</span>
        </span>
      </Link>
    </li>
  )
}

export interface DiagnosticResultProps {
  data: DiagnosticResultData
  heading: string
  saving?: boolean
  error?: string
  /** Extra info line (e.g. «Ошибок в журнале: +5»). */
  note?: string
  onRestart(): void
}

export function DiagnosticResult({ data, heading, saving, error, note, onRestart }: DiagnosticResultProps) {
  const route = recommendedRoute(data.topics)
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? route : route.slice(0, ROUTE_PREVIEW)
  const skipped = new Set(data.skippedLevels)
  const answered = [...data.topics.values()].reduce((s, o) => s + o.total, 0)
  const correct = [...data.topics.values()].reduce((s, o) => s + o.correct, 0)
  // Only levels the diagnostic actually probes (B2 has no questions yet).
  const probed = new Set(getDiagnostic().questions.map((q) => q.level))

  return (
    <div className="page">
      <section className="card-raised relative space-y-4 overflow-hidden">
        <div className="space-y-1">
          <h1>{heading}</h1>
          <p className="text-sm text-ink-muted">
            {formatDate(data.at)} · верно {correct} из {answered}
          </p>
        </div>
        <GradeCounts topics={data.topics} />
        {data.skippedLevels.length > 0 && (
          <p className="text-sm text-ink-muted">
            Не оценивались: {data.skippedLevels.join(', ')} — диагностика остановлена раньше.
          </p>
        )}
        {saving && <p className="text-sm text-ink-muted">Сохраняю…</p>}
        {error && <p className="text-sm text-danger">Не удалось сохранить: {error}</p>}
        {note && !saving && <p className="text-sm text-ink-muted">{note}</p>}
      </section>

      <section className="card space-y-3">
        <h2>Рекомендуемый маршрут</h2>
        {route.length === 0 ? (
          <p className="text-ink-muted">
            Проверенные темы вы знаете уверенно — они отмечены как пройденные и будут встречаться на повторении.
            {data.skippedLevels.length > 0 && ' Продолжайте курс со следующего уровня.'}
          </p>
        ) : (
          <>
            <p className="text-sm text-ink-muted">
              Сначала темы, где ошибок больше всего, затем темы с пробелами. Зелёные темы — «пройдено, на повторении».
            </p>
            <ol className="space-y-0.5">
              {shown.map((r, i) => (
                <li key={r.id}>
                  <Link
                    to={`/topic/${r.id}`}
                    className="group flex min-h-11 items-center gap-3 rounded-control px-1 py-1.5 text-ink no-underline hover:bg-surface-2 sm:px-2"
                  >
                    <span className="w-6 shrink-0 text-right text-sm text-ink-muted tabular-nums">{i + 1}.</span>
                    <i className={`size-2.5 shrink-0 rounded-full ${GRADE_META[r.grade].dot}`} title={GRADE_META[r.grade].label} />
                    <span className="min-w-0 flex-1 text-sm leading-snug font-medium">{topicTitle(r.id)}</span>
                    <span className="shrink-0 text-xs font-semibold text-ink-muted">{getTopic(r.id)?.level ?? r.id.slice(0, 2).toUpperCase()}</span>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
                  </Link>
                </li>
              ))}
            </ol>
            {route.length > ROUTE_PREVIEW && (
              <button
                type="button"
                className="btn-ghost btn-sm -ml-4 text-ink"
                aria-expanded={showAll}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'Свернуть' : `Показать все (${route.length})`}
              </button>
            )}
          </>
        )}
      </section>

      <section className="space-y-4">
        <h2>Карта тем</h2>
        <div className="flex flex-wrap gap-3 text-sm text-ink-muted">
          {LEGEND.map((g) => (
            <span key={g} className="flex items-center gap-1.5">
              <i className={`inline-block size-2.5 rounded-full ${GRADE_META[g].dot}`} />
              {GRADE_META[g].label}
            </span>
          ))}
        </div>
        {getSyllabus()
          .levels.filter((l) => l.modules.length > 0 && probed.has(l.level))
          .map((lvl) => (
            <div key={lvl.level} className="card space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Illustration name={levelArt(lvl.level)} sizes="56px" className="size-14 rounded-2xl" />
                <LevelBadge level={lvl.level} />
                {skipped.has(lvl.level) && <span className="text-sm text-ink-muted">не оценивался</span>}
              </div>
              {lvl.modules.map((mod) => (
                <div key={mod.id} className="space-y-2">
                  <h3 className="text-sm font-semibold text-ink-muted">{mod.title}</h3>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {mod.topics.map((id) => (
                      <TopicChip key={id} id={id} outcome={data.topics.get(id)} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <ButtonLink to="/syllabus">К курсу</ButtonLink>
        <button type="button" className="btn-secondary" onClick={onRestart}>
          Пройти заново
        </button>
      </div>
    </div>
  )
}
