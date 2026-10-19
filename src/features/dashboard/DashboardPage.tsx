import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ChevronRight,
  ClipboardCheck,
  Flame,
  Layers,
  MessagesSquare,
  Map as MapIcon,
  Sparkles,
} from 'lucide-react'
import type { ErrorEntry } from '@/data/types.ts'
import { listSituations } from '@/content'
import { dueCards, isNewCard } from '@/engine/fsrs'
import { ButtonLink } from '@/components/Button'
import { Illustration } from '@/components/Illustration'
import { cx } from '@/components/cx'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/EmptyState'
import { ProgressBar } from '@/components/ProgressBar'
import { ProgressRing } from '@/components/ProgressRing'
import { LevelBadge } from '@/components/StatusBadge'
import { STATUS_META, STATUS_ORDER, pct } from '@/features/syllabus/status'
import { newSeenToday } from '@/features/srs/newCardCounter'
import { errorTopicLink, exercisePromptText } from '@/features/srs/cardContent'
import { plural } from '@/features/library/format'
import { pickDaily } from '@/features/tutor/items'
import { activityDays, computeStreak, levelStats, suggestTopics, weeklyActivity, type LevelStats } from './stats'
import { useProgressData } from './useProgressData'

const DAY = 86_400_000
const rtf = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' })

/** «сегодня», «вчера», «3 дня назад» (calendar days). */
function relativeDay(at: number, now: number) {
  const d0 = new Date(now).setHours(0, 0, 0, 0)
  const d1 = new Date(at).setHours(0, 0, 0, 0)
  const days = Math.round((d1 - d0) / DAY)
  return days > -7 ? rtf.format(days, 'day') : new Date(at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function DashboardPage() {
  const data = useProgressData()
  const { progress, cards, errors, settings } = data

  const [now] = useState(() => Date.now())
  const view = useMemo(() => {
    const session = dueCards(cards, now, { newPerDay: settings?.newCardsPerDay, newSeenToday: newSeenToday(now) })
    const week = weeklyActivity(progress.values(), cards, now)
    const today = week.find((d) => d.isToday)
    return {
      due: session.length,
      dueNew: session.filter(isNewCard).length,
      suggestions: suggestTopics(progress, 2),
      streak: computeStreak(activityDays(progress.values(), cards, errors), now),
      week,
      doneToday: today ? today.results + today.reviews : 0,
      levels: levelStats(progress),
      daily: pickDaily(progress, now),
    }
  }, [progress, cards, errors, settings, now])

  if (data.loading) return <PageSkeleton cards={3} />
  if (data.error) return <ErrorState detail={data.error} onRetry={() => void data.reload()} />

  const lastDiag = settings?.lastDiagnosticAt
  const diagStale = lastDiag !== undefined && now - lastDiag > 42 * DAY
  const firstRun = progress.size === 0 && cards.length === 0 && lastDiag === undefined
  const first = view.suggestions[0]
  const dueMin = Math.max(1, Math.round(view.due * 0.25))
  const todayLine = firstRun
    ? 'Начните с диагностики: около 20 минут, и курс подскажет, с чего начать.'
    : view.due > 0
      ? `К повторению ${plural(view.due, 'карточка', 'карточки', 'карточек')} — это около ${dueMin} мин.`
      : first
        ? `Повторение готово. Дальше по курсу: ${first.topic.title}.`
        : 'На сегодня всё сделано.'

  const diagCard = (lastDiag === undefined || diagStale) && (
    <EntryCard
      to="/diagnostic"
      icon={<ClipboardCheck />}
      title={lastDiag === undefined ? 'Пройдите диагностику' : 'Пора сверить уровень'}
      text={
        lastDiag === undefined
          ? '≈20 минут — и курс подскажет, с чего начать.'
          : `Последняя диагностика ${relativeDay(lastDiag, now)}. Пройдите заново и сравните.`
      }
    />
  )
  const topicsTotal = view.levels.reduce((n, l) => n + l.total, 0)
  const situationsTotal = listSituations().length

  return (
    <div className="page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <h1>Сегодня</h1>
          <p className="text-ink-muted">{todayLine}</p>
        </div>
        {!firstRun && <StreakBadge streak={view.streak.streak} activeToday={view.streak.activeToday} />}
      </header>

      {firstRun ? (
        <>
          <Onboarding firstTopic={first?.topic} />
          <section aria-label="Ещё в приложении" className="grid gap-(--gutter) md:grid-cols-2">
            <TutorCard daily={view.daily} />
            <EntryCard
              to="/syllabus"
              icon={<MapIcon />}
              title="Карта курса"
              text={`${plural(topicsTotal, 'тема', 'темы', 'тем')} от A1 до B2: правила, примеры, упражнения и мини-тесты.`}
            />
          </section>
        </>
      ) : (
        <>
          <TodayHero
            due={view.due}
            dueNew={view.dueNew}
            doneToday={view.doneToday}
            hasCards={cards.length > 0}
            suggestions={view.suggestions}
          />

          {/* Progress: one card, two measures side by side (levels · the week). */}
          <section className="card grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-12" aria-labelledby="dash-levels">
            <div className="space-y-4">
              <div className="flex min-h-11 items-center justify-between gap-3">
                <h2 id="dash-levels">Прогресс по уровням</h2>
                <Link to="/syllabus" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold whitespace-nowrap">
                  Карта курса <ArrowRight aria-hidden className="size-4" />
                </Link>
              </div>
              <div className="space-y-3">
                {view.levels.map((l) => (
                  <LevelBar key={l.level} stats={l} />
                ))}
              </div>
              <Legend />
            </div>
            <div className="space-y-4" aria-labelledby="dash-week">
              <h2 id="dash-week" className="flex min-h-11 items-center">
                Активность за неделю
              </h2>
              <WeekBars week={view.week} />
            </div>
          </section>

          <section className="card space-y-4" aria-labelledby="dash-errors">
            <h2 id="dash-errors">Последние ошибки</h2>
            {errors.length === 0 ? (
              <EmptyState
                compact
                art="empty-errors"
                title="Ошибок пока нет"
                text="Сюда попадут ошибки из упражнений — их удобно повторять карточками."
              />
            ) : (
              <ul className="grid gap-2 md:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
                {errors.slice(0, 3).map((e) => (
                  <ErrorRow key={e.id} e={e} now={now} />
                ))}
              </ul>
            )}
          </section>

          {/* Secondary entries: the agent, then the diagnostic when it is due (otherwise the situations). */}
          <section aria-label="Ещё на сегодня" className="grid gap-(--gutter) md:grid-cols-2">
            <TutorCard daily={view.daily} />
            {diagCard || (
              <EntryCard
                to="/situations"
                icon={<MessagesSquare />}
                title="Ситуации"
                text={`${plural(situationsTotal, 'бытовая сцена', 'бытовые сцены', 'бытовых сцен')}: диалоги, фразы и письма для жизни в Португалии.`}
              />
            )}
          </section>
        </>
      )}
    </div>
  )
}

/** A quiet secondary entry: neutral icon disc, title, one line, chevron. */
function EntryCard({ to, icon, title, text, children }: { to: string; icon: ReactNode; title: string; text: string; children?: ReactNode }) {
  return (
    <Link to={to} className="card card-link group flex items-center gap-4">
      <span aria-hidden className="grid size-11 shrink-0 place-items-center self-start rounded-full bg-surface-2 text-ink [&_svg]:size-5">
        {icon}
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block font-display text-h2">{title}</span>
        {children}
        <span className="block text-sm text-ink-muted">{text}</span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  )
}

/** First visit: one clear recommendation instead of empty widgets (audit §3.2). */
function Onboarding({ firstTopic }: { firstTopic?: { id: string; title: string } }) {
  return (
    <section className="card-raised relative isolate grid gap-6 overflow-hidden md:grid-cols-[1fr_minmax(0,0.9fr)] md:items-center">
      {/* Phones get a wide street crop (the tram and the roofs), so the actions stay on the first screen. */}
      <div className="relative aspect-[2/1] overflow-hidden rounded-card md:order-last md:aspect-[1264/848]">
        <Illustration name="hero" eager cover sizes="(min-width: 1280px) 520px, (min-width: 768px) 45vw, 100vw" className="object-[70%_62%]" />
      </div>
      <div className="space-y-6">
      <div className="max-w-[46ch] space-y-3">
        <h2>
          <span lang="pt-PT">Bem-vindo!</span> Начнём с главного
        </h2>
        <p className="text-ink-muted">
          Пройдите диагностику (≈20 минут) — курс подсветит, что вы уже знаете и с чего начать. Или сразу откройте первую
          тему уровня A1.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
        <ButtonLink to="/diagnostic" className="shrink-0" icon={<ClipboardCheck />}>
          Пройти диагностику
        </ButtonLink>
        {firstTopic && (
          <ButtonLink to={`/topic/${firstTopic.id}`} variant="secondary" title={firstTopic.title}>
            Открыть первую тему
          </ButtonLink>
        )}
      </div>
      </div>
    </section>
  )
}

/** «Сегодня»: the day's one primary action, then the next topics; the poster beside it carries the day's goal ring. */
function TodayHero({
  due,
  dueNew,
  doneToday,
  hasCards,
  suggestions,
}: {
  due: number
  dueNew: number
  doneToday: number
  hasCards: boolean
  suggestions: ReturnType<typeof suggestTopics>
}) {
  const goal = doneToday + due
  const ratio = goal ? doneToday / goal : doneToday > 0 ? 1 : 0
  const primaryTopic = due === 0 ? suggestions[0] : undefined
  const rows = due === 0 ? suggestions.slice(1) : suggestions

  return (
    <section className="grid gap-(--gutter) lg:grid-cols-3" aria-labelledby="dash-today">
      <div className="card-raised flex flex-col gap-6 lg:col-span-2">
        <h2 id="dash-today" className="sr-only">
          План на сегодня
        </h2>
        <div className="space-y-2">
          {due > 0 ? (
            <>
              <p className="flex items-baseline gap-2.5">
                <span className="font-display text-h1 leading-none font-black tabular-nums">{due}</span>
                <span className="font-display text-h2">
                  {plural(due, 'карточка', 'карточки', 'карточек').replace(/^\d+\s/, '')} к повторению
                </span>
              </p>
              <p className="text-sm text-ink-muted">
                {dueNew ? (dueNew === due ? 'Все новые' : `Из них новых: ${dueNew}`) : 'Только повторение'} · ≈
                {Math.max(1, Math.round(due * 0.25))} мин
              </p>
            </>
          ) : primaryTopic ? (
            <>
              <p className="font-display text-h2">{hasCards ? 'Повторение на сегодня готово' : 'Продолжим курс'}</p>
              <p className="text-sm text-ink-muted">
                {primaryTopic.reason === 'next' ? 'Следующая тема' : 'Подтянуть'}: {primaryTopic.topic.title}
              </p>
            </>
          ) : (
            <p className="font-display text-h2">На сегодня всё — parabéns!</p>
          )}
        </div>

        {due > 0 ? (
          <ButtonLink to="/review" block className="sm:w-auto sm:self-start" icon={<Layers />}>
            Начать повторение
          </ButtonLink>
        ) : primaryTopic ? (
          <ButtonLink to={`/topic/${primaryTopic.topic.id}`} block className="sm:w-auto sm:self-start" iconEnd={<ArrowRight />}>
            {primaryTopic.reason === 'next' ? 'Открыть тему' : 'Повторить тему'}
          </ButtonLink>
        ) : null}

        {rows.length > 0 && (
          <div className="mt-auto space-y-2">
            <h3 className="text-sm font-semibold text-ink-muted">Дальше по курсу</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {rows.map(({ topic, reason, progress: p }) => (
                <li key={topic.id} className="flex">
                  <Link
                    to={`/topic/${topic.id}`}
                    className="group flex min-h-16 flex-1 items-center gap-3 rounded-control bg-surface-2 px-4 py-3 text-ink no-underline transition-[background-color,transform] duration-150 hover:bg-sunken/60 active:scale-[0.99] motion-reduce:transition-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 leading-snug font-semibold">{topic.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
                        <LevelBadge level={topic.level} />
                        {reason === 'next' ? 'Следующая тема' : `Подтянуть · было ${pct(p!.lastPct)}`}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Signature poster (Lisbon at dusk, halftone) with the day's goal ring. */}
      <div className="relative isolate flex min-h-64 items-end overflow-hidden rounded-card bg-terracotta-fill p-4 lg:p-6">
        <Illustration name="hero" cover eager sizes="(min-width: 1024px) 400px, 100vw" className="-z-10 object-[68%_50%]" />
        <div className="flex items-center gap-4 rounded-pill bg-surface py-2 pr-6 pl-2">
          <ProgressRing value={ratio} size={64} stroke={7} tone="brand">
            <span className="font-display text-h2 leading-none font-black tabular-nums">{doneToday}</span>
          </ProgressRing>
          <span className="leading-tight">
            <span className="block font-semibold">Сделано сегодня</span>
            <span className="block text-sm text-ink-muted">
              {goal ? `${Math.round(ratio * 100)}% дневной цели` : 'цель появится с карточками'}
            </span>
          </span>
        </div>
      </div>
    </section>
  )
}

/** «Практика с агентом» — a quiet entry card (the day's suggested topics as its content). */
function TutorCard({ daily }: { daily: ReturnType<typeof pickDaily> }) {
  const items = [...daily.topics.map((t) => t.title), ...(daily.situation ? [daily.situation.title] : [])]
  return (
    <EntryCard to="/tutor" icon={<Sparkles />} title="Беседа дня с агентом" text="Готовый промпт для Claude или ChatGPT — в одно касание.">
      <span className="line-clamp-2 block font-semibold">{items.join(' · ') || 'Разговор на свободную тему'}</span>
    </EntryCard>
  )
}

function StreakBadge({ streak, activeToday }: { streak: number; activeToday: boolean }) {
  const title = activeToday ? 'Сегодня занятие засчитано' : streak ? 'Позанимайтесь сегодня, чтобы не прервать серию' : ''
  return (
    <div
      title={title}
      className={cx(
        'flex min-h-11 items-center gap-2 rounded-pill py-2 pr-5 pl-2 text-sm font-semibold',
        activeToday ? 'bg-ink text-surface' : streak ? 'bg-surface text-ink' : 'bg-surface text-ink-muted',
      )}
    >
      <span aria-hidden className={cx('grid size-8 place-items-center rounded-full', activeToday || streak ? 'bg-brand text-on-brand' : 'bg-surface-2')}>
        <Flame className={cx('size-4.5', activeToday && 'fill-current')} />
      </span>
      {streak ? `${plural(streak, 'день', 'дня', 'дней')} подряд` : 'Начните серию сегодня'}
    </div>
  )
}

function WeekBars({ week }: { week: ReturnType<typeof weeklyActivity> }) {
  const max = Math.max(1, ...week.map((d) => d.results + d.reviews))
  const total = week.reduce((s, d) => s + d.results + d.reviews, 0)
  return (
    <div>
      <div className="flex h-48 items-end gap-2" role="img" aria-label={`Всего за неделю: ${total}`}>
        {week.map((d) => {
          const n = d.results + d.reviews
          return (
            <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.day}: результатов ${d.results}, карточек ${d.reviews}`}>
              <span className="text-xs font-semibold text-ink-muted tabular-nums">{n || ''}</span>
              <div className="flex h-full w-full max-w-9 flex-col justify-end gap-0.5 overflow-hidden rounded-pill bg-surface-2">
                <div className="bg-azulejo transition-[height] duration-500" style={{ height: `${(d.reviews / max) * 100}%` }} />
                <div className="bg-brand transition-[height] duration-500" style={{ height: `${(d.results / max) * 100}%` }} />
              </div>
              <span className={cx('text-xs', d.isToday ? 'rounded-pill bg-ink px-1.5 font-bold text-surface' : 'text-ink-muted')}>{d.label}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-muted">
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-sm bg-brand" /> уроки и тесты
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-sm bg-azulejo" /> карточки
        </span>
        <span className="ml-auto font-semibold text-ink tabular-nums">Всего: {total}</span>
      </div>
    </div>
  )
}

function LevelBar({ stats }: { stats: LevelStats }) {
  const { level, total, available, counts } = stats
  const done = counts.confident
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <Link to={`/syllabus?level=${level}`} className="inline-flex min-h-8 items-center gap-2 font-bold text-ink no-underline hover:underline">
          <LevelBadge level={level} />
          <span className="sr-only">Уровень {level}</span>
        </Link>
        <span className="text-ink-muted tabular-nums">
          {total === 0 ? 'скоро' : `${done} из ${total} уверенно${available < total ? ` · доступно ${available}` : ''}`}
        </span>
      </div>
      <ProgressBar
        size="lg"
        label={`Уровень ${level}: уверенно ${done} из ${total}`}
        segments={
          total > 0
            ? STATUS_ORDER.filter((s) => s !== 'not-started').map((s) => ({
                value: counts[s] / total,
                className: STATUS_META[s].bar,
                title: `${STATUS_META[s].label}: ${counts[s]}`,
              }))
            : []
        }
      />
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2 text-sm text-ink-muted">
      {STATUS_ORDER.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <i className={`inline-block size-2.5 rounded-full ${STATUS_META[s].dot}`} />
          {STATUS_META[s].label}
        </span>
      ))}
    </div>
  )
}

function ErrorRow({ e, now }: { e: ErrorEntry; now: number }) {
  const link = errorTopicLink(e.topicId)
  const prompt = exercisePromptText(e.exerciseId)
  return (
    <li className="space-y-1 rounded-control bg-surface-2 px-4 py-3 text-sm">
      {prompt && <p className="truncate text-ink-muted">{prompt}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-2">
        <dt className="text-ink-muted">Вы:</dt>
        <dd lang="pt-PT" className="text-danger line-through decoration-danger/50">
          {e.given || '—'}
        </dd>
        <dt className="text-ink-muted">Верно:</dt>
        <dd lang="pt-PT" className="font-semibold text-success">
          {e.expected}
        </dd>
      </dl>
      <p className="text-sm text-ink-muted">
        {relativeDay(e.at, now)}
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
