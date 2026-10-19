import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ErrorEntry } from '@/data/types.ts'
import { dueCards, isNewCard } from '@/engine/fsrs'
import { STATUS_META, STATUS_ORDER, pct } from '@/features/syllabus/status'
import { newSeenToday } from '@/features/srs/newCardCounter'
import { errorTopicLink, exercisePromptText } from '@/features/srs/cardContent'
import { activityDays, computeStreak, levelStats, suggestTopics, weeklyActivity, type LevelStats } from './stats'
import { useProgressData } from './useProgressData'

const DAY = 86_400_000

export function DashboardPage() {
  const data = useProgressData()
  const { progress, cards, errors, settings } = data

  const [now] = useState(() => Date.now())
  const view = useMemo(() => {
    const session = dueCards(cards, now, { newPerDay: settings?.newCardsPerDay, newSeenToday: newSeenToday(now) })
    return {
      due: session.length,
      dueNew: session.filter(isNewCard).length,
      suggestions: suggestTopics(progress, 2),
      streak: computeStreak(activityDays(progress.values(), cards, errors), now),
      week: weeklyActivity(progress.values(), cards, now),
      levels: levelStats(progress),
    }
  }, [progress, cards, errors, settings, now])

  if (data.loading) return <p className="text-stone-500">Загрузка…</p>
  if (data.error) return <p className="text-red-600">Ошибка загрузки данных: {data.error}</p>

  const lastDiag = settings?.lastDiagnosticAt
  const diagStale = lastDiag !== undefined && now - lastDiag > 42 * DAY

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <h1>Olá! 👋</h1>
        <StreakBadge streak={view.streak.streak} activeToday={view.streak.activeToday} />
      </div>

      {/* Сессия дня */}
      <section className="card space-y-3">
        <h2>Сессия дня</h2>
        <ol className="space-y-2">
          <li>
            <Link
              to="/review"
              className="flex items-center gap-3 rounded-xl border border-stone-200 p-3 no-underline hover:border-brand-500 dark:border-stone-800"
            >
              <span className="text-2xl" aria-hidden>
                🔁
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-stone-900 dark:text-stone-100">Повторение карточек</span>
                <span className="block text-sm text-stone-500">
                  {view.due === 0
                    ? cards.length === 0
                      ? 'Карточек пока нет — добавьте их из уроков'
                      : 'На сегодня всё повторено'
                    : `${view.due} к повторению${view.dueNew ? `, из них новых: ${view.dueNew}` : ''}`}
                </span>
              </span>
              {view.due > 0 && (
                <span className="rounded-full bg-brand-700 px-2.5 py-0.5 text-sm font-semibold text-white">
                  {view.due}
                </span>
              )}
            </Link>
          </li>
          {view.suggestions.map(({ topic, reason, progress: p }) => (
            <li key={topic.id}>
              <Link
                to={`/topic/${topic.id}`}
                className="flex items-center gap-3 rounded-xl border border-stone-200 p-3 no-underline hover:border-brand-500 dark:border-stone-800"
              >
                <span className="text-2xl" aria-hidden>
                  {reason === 'next' ? '📖' : '🎯'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-stone-900 dark:text-stone-100">{topic.title}</span>
                  <span className="block truncate text-sm text-stone-500">
                    {topic.level} ·{' '}
                    {reason === 'next' ? 'Следующая тема' : `Подтянуть: последний результат ${pct(p!.lastPct)}`}
                  </span>
                </span>
                {p && <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_META[p.status].chip}`}>{STATUS_META[p.status].label}</span>}
              </Link>
            </li>
          ))}
        </ol>
        {lastDiag === undefined ? (
          <p className="text-sm">
            Вы ещё не проходили диагностику. <Link to="/diagnostic">Пройти диагностику →</Link>
          </p>
        ) : diagStale ? (
          <p className="text-sm text-stone-500">
            Диагностика была {new Date(lastDiag).toLocaleDateString('ru-RU')}.{' '}
            <Link to="/diagnostic">Пройти заново и сравнить →</Link>
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Weekly activity */}
        <section className="card space-y-3">
          <h2>Активность за неделю</h2>
          <WeekBars week={view.week} />
        </section>

        {/* Recent errors */}
        <section className="card space-y-3">
          <h2>Последние ошибки</h2>
          {errors.length === 0 ? (
            <p className="text-sm text-stone-500">Ошибок пока нет.</p>
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {errors.slice(0, 5).map((e) => (
                <ErrorRow key={e.id} e={e} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Levels */}
      <section className="card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2>Прогресс по уровням</h2>
          <Link to="/syllabus" className="shrink-0 text-sm whitespace-nowrap">
            Карта курса →
          </Link>
        </div>
        {view.levels.map((l) => (
          <LevelBar key={l.level} stats={l} />
        ))}
        <Legend />
      </section>
    </div>
  )
}

function StreakBadge({ streak, activeToday }: { streak: number; activeToday: boolean }) {
  const title = activeToday ? 'Сегодня занятие засчитано' : streak ? 'Позанимайтесь сегодня, чтобы не прервать серию' : ''
  return (
    <div
      title={title}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
        activeToday
          ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-200'
          : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
      }`}
    >
      <span aria-hidden>🔥</span>
      {streak} {plural(streak, 'день', 'дня', 'дней')} подряд
    </div>
  )
}

function WeekBars({ week }: { week: ReturnType<typeof weeklyActivity> }) {
  const max = Math.max(1, ...week.map((d) => d.results + d.reviews))
  const total = week.reduce((s, d) => s + d.results + d.reviews, 0)
  return (
    <div>
      <div className="flex h-28 items-end gap-2" role="img" aria-label={`Всего за неделю: ${total}`}>
        {week.map((d) => {
          const n = d.results + d.reviews
          return (
            <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.day}: результатов ${d.results}, карточек ${d.reviews}`}>
              <span className="text-xs text-stone-500 tabular-nums">{n || ''}</span>
              <div className="flex w-full max-w-8 flex-col justify-end overflow-hidden rounded-md bg-stone-100 dark:bg-stone-800" style={{ height: '100%' }}>
                <div className="bg-sky-400" style={{ height: `${(d.reviews / max) * 100}%` }} />
                <div className="bg-brand-600" style={{ height: `${(d.results / max) * 100}%` }} />
              </div>
              <span className={`text-xs ${d.isToday ? 'font-semibold text-stone-900 dark:text-stone-100' : 'text-stone-500'}`}>
                {d.label}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-4 text-xs text-stone-500">
        <span className="flex items-center gap-1">
          <i className="inline-block size-2.5 rounded-sm bg-brand-600" /> уроки и тесты
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block size-2.5 rounded-sm bg-sky-400" /> карточки
        </span>
      </div>
    </div>
  )
}

function LevelBar({ stats }: { stats: LevelStats }) {
  const { level, total, available, counts } = stats
  const done = counts.confident
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <Link to={`/syllabus?level=${level}`} className="font-semibold">
          {level}
        </Link>
        <span className="text-stone-500">
          {total === 0 ? 'скоро' : `${done} из ${total} уверенно${available < total ? ` · доступно ${available}` : ''}`}
        </span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        {total > 0 &&
          STATUS_ORDER.filter((s) => s !== 'not-started').map((s) =>
            counts[s] ? (
              <div key={s} className={STATUS_META[s].bar} style={{ width: `${(counts[s] / total) * 100}%` }} title={`${STATUS_META[s].label}: ${counts[s]}`} />
            ) : null,
          )}
      </div>
      {total > 0 && (
        <div className="flex flex-wrap gap-x-3 text-xs text-stone-500">
          {STATUS_ORDER.map((s) => (
            <span key={s}>
              {STATUS_META[s].label.toLowerCase()}: {counts[s]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 border-t border-stone-100 pt-3 text-xs text-stone-500 dark:border-stone-800">
      {STATUS_ORDER.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <i className={`inline-block size-2.5 rounded-full ${STATUS_META[s].dot}`} />
          {STATUS_META[s].label}
        </span>
      ))}
    </div>
  )
}

function ErrorRow({ e }: { e: ErrorEntry }) {
  const link = errorTopicLink(e.topicId)
  const prompt = exercisePromptText(e.exerciseId)
  return (
    <li className="py-2 text-sm">
      {prompt && <p className="truncate text-stone-500">{prompt}</p>}
      <p>
        <span className="text-red-600 line-through decoration-red-400 dark:text-red-400">{e.given || '—'}</span>{' '}
        → <span className="font-medium text-emerald-700 dark:text-emerald-400">{e.expected}</span>
      </p>
      <p className="text-xs text-stone-500">
        {new Date(e.at).toLocaleDateString('ru-RU')}
        {link && (
          <>
            {' · '}
            <Link to={link.to}>{link.title}</Link>
          </>
        )}
      </p>
    </li>
  )
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
