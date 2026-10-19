import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getDiagnostic, getSyllabus, getTopic } from '@/content'
import { LevelBadge } from '@/components/StatusBadge'
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
        <div key={g} className={`rounded-xl border px-2 py-2 ${GRADE_META[g].chip}`}>
          <p className="text-2xl font-bold tabular-nums">{c[g]}</p>
          <p className="text-xs">{GRADE_META[g].label}</p>
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
        className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 py-1.5 text-sm no-underline transition ${meta.chip}`}
        title={meta.label}
      >
        <i className={`size-2.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
        <span className="min-w-0 flex-1 leading-snug">{topicTitle(id)}</span>
        <span className="shrink-0 text-xs tabular-nums opacity-80">
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
    <div className="space-y-5">
      <section className="card space-y-4 sm:p-6">
        <div className="space-y-1">
          <h1>{heading}</h1>
          <p className="text-sm text-stone-500">
            {formatDate(data.at)} · верно {correct} из {answered}
          </p>
        </div>
        <GradeCounts topics={data.topics} />
        {data.skippedLevels.length > 0 && (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Не оценивались: {data.skippedLevels.join(', ')} — диагностика остановлена раньше.
          </p>
        )}
        {saving && <p className="text-sm text-stone-500">Сохраняю…</p>}
        {error && <p className="text-sm text-red-600">Не удалось сохранить: {error}</p>}
        {note && !saving && <p className="text-sm text-stone-500">{note}</p>}
      </section>

      <section className="card space-y-3 sm:p-6">
        <h2>Рекомендуемый маршрут</h2>
        {route.length === 0 ? (
          <p className="text-stone-600 dark:text-stone-400">
            Проверенные темы вы знаете уверенно — они отмечены как пройденные и будут встречаться на повторении.
            {data.skippedLevels.length > 0 && ' Продолжайте курс со следующего уровня.'}
          </p>
        ) : (
          <>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Сначала темы, где ошибок больше всего, затем темы с пробелами. Зелёные темы — «пройдено, на повторении».
            </p>
            <ol className="space-y-0.5">
              {shown.map((r, i) => (
                <li key={r.id}>
                  <Link
                    to={`/topic/${r.id}`}
                    className="flex items-center gap-3 rounded-xl px-1 py-1.5 no-underline sm:px-2 hover:bg-stone-100 dark:hover:bg-stone-800/60"
                  >
                    <span className="w-6 shrink-0 text-right text-sm text-stone-400 tabular-nums">{i + 1}.</span>
                    <i className={`size-2.5 shrink-0 rounded-full ${GRADE_META[r.grade].dot}`} title={GRADE_META[r.grade].label} />
                    <span className="min-w-0 flex-1 text-[15px] leading-snug text-stone-900 sm:text-base dark:text-stone-100">{topicTitle(r.id)}</span>
                    <span className="shrink-0 text-xs text-stone-500">{getTopic(r.id)?.level ?? r.id.slice(0, 2).toUpperCase()}</span>
                  </Link>
                </li>
              ))}
            </ol>
            {route.length > ROUTE_PREVIEW && (
              <button
                type="button"
                className="text-sm text-brand-700 dark:text-brand-500"
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
        <div className="flex flex-wrap gap-3 text-xs text-stone-500">
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
              <div className="flex flex-wrap items-center gap-2">
                <LevelBadge level={lvl.level} />
                {skipped.has(lvl.level) && <span className="text-sm text-stone-500">не оценивался</span>}
              </div>
              {lvl.modules.map((mod) => (
                <div key={mod.id} className="space-y-2">
                  <h3 className="text-sm font-medium text-stone-600 dark:text-stone-400">{mod.title}</h3>
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
        <Link to="/syllabus" className="btn-primary no-underline">
          К курсу
        </Link>
        <button type="button" className="btn-secondary" onClick={onRestart}>
          Пройти заново
        </button>
      </div>
    </div>
  )
}
