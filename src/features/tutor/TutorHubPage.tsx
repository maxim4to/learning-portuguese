import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, History, MessagesSquare, Sun, Target } from 'lucide-react'
import { EmptyState, Skeleton } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { LevelBadge, StatusBadge } from '@/components/StatusBadge'
import { useProgressMap } from '@/features/lessons/useTopicProgress'
import { nextTopics, pickDaily, resolveTutorItem, shakyTopics, suggestedSituations } from './items'
import { DAILY_MODES, modeTitle } from './modes'
import { buildDailyPrompt, type DailyPick } from './prompts'
import { tutorHistory } from './persist'
import { TutorPanel } from './TutorPanel'

const linkCard = 'card card-link group flex h-full items-start gap-3'
const chevron = <ChevronRight aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />

function SectionTitle({ icon, tone, children }: { icon: ReactNode; tone: string; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2.5">
      <span aria-hidden className={`grid size-9 place-items-center rounded-xl ${tone}`}>
        {icon}
      </span>
      {children}
    </h2>
  )
}

/** /tutor — «Практика с агентом»: daily combined session, suggestions, history of completed sessions. */
export function TutorHubPage() {
  const { map: progress, loaded, reload } = useProgressMap()
  const [now] = useState(() => Date.now())

  // Picks are frozen once a daily session is saved, so the panel (and its «засчитано») stays put after reload.
  const [frozen, setFrozen] = useState<DailyPick | null>(null)

  const view = useMemo(() => {
    const shaky = shakyTopics(progress).slice(0, 4)
    return {
      daily: pickDaily(progress, now),
      shaky,
      next: nextTopics(progress, shaky.length >= 4 ? 2 : 3),
      situations: suggestedSituations(progress, 4),
      history: tutorHistory(progress.values()),
    }
  }, [progress, now])

  const daily = frozen ?? view.daily
  const dailyIds = [...daily.topics.map((t) => t.id), ...(daily.situation ? [daily.situation.id] : [])]
  const dailyKey = dailyIds.join('|')
  const buildDaily = useCallback(() => buildDailyPrompt(daily), [daily])

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ to: '/', label: 'Главная' }}
        eyebrow={<span className="text-terracotta">ИИ-репетитор</span>}
        title="Практика с агентом"
        subtitle={
          <p>
          Занятия с ИИ-ассистентом (Claude, ChatGPT…) по материалам курса. Выберите занятие, скопируйте промпт и вставьте его в новый
          чат — ассистент проведёт урок по-русски, строго на европейском португальском. В конце он выдаст строку «Итог: …» — вставьте её
          при отметке занятия, и оно засчитается в прогресс темы.
          </p>
        }
      />

      <section className="space-y-3">
        <div className="space-y-1">
          <SectionTitle icon={<Sun className="size-5" />} tone="bg-sun-soft text-sun">
            Беседа дня
          </SectionTitle>
          {loaded && (
            <p className="text-sm text-ink-muted">
              {daily.topics.length > 0 && (
                <>
                  {daily.topics.length > 1 ? 'Темы: ' : 'Тема: '}
                  {daily.topics.map((t, i) => (
                    <span key={t.id}>
                      {i > 0 && ', '}
                      <Link to={`/topic/${t.id}`}>{t.title}</Link>
                    </span>
                  ))}
                </>
              )}
              {daily.situation && (
                <>
                  {daily.topics.length > 0 && ' · '}
                  Ситуация: <Link to={`/situation/${daily.situation.id}`}>{daily.situation.title}</Link>
                </>
              )}
            </p>
          )}
        </div>
        {loaded ? (
          <TutorPanel
            key={dailyKey}
            modes={DAILY_MODES}
            build={buildDaily}
            targetIds={dailyIds}
            hideHubLink
            onSaved={() => {
              setFrozen(daily)
              void reload()
            }}
          />
        ) : (
          <Skeleton className="h-64 rounded-hero" />
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle icon={<Target className="size-5" />} tone="bg-terracotta-soft text-terracotta">
          Темы для занятия
        </SectionTitle>
        <p className="text-sm text-ink-muted">Сначала слабые темы, затем следующие по курсу.</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {view.shaky.map(({ topic, progress: p }) => (
            <li key={topic.id}>
              <Link to={`/topic/${topic.id}?tab=tutor`} className={linkCard}>
                <LevelBadge level={topic.level} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{topic.title}</span>
                  <span className="block text-sm text-ink-muted">последний результат {Math.round(p.lastPct * 100)}%</span>
                </span>
                <StatusBadge status={p.status} />
                {chevron}
              </Link>
            </li>
          ))}
          {view.next.map((topic) => (
            <li key={topic.id}>
              <Link to={`/topic/${topic.id}?tab=tutor`} className={linkCard}>
                <LevelBadge level={topic.level} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{topic.title}</span>
                  <span className="block text-sm text-ink-muted">следующая тема курса</span>
                </span>
                <StatusBadge status="not-started" />
                {chevron}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <SectionTitle icon={<MessagesSquare className="size-5" />} tone="bg-azulejo-soft text-azulejo">
          Ситуации для сценок
        </SectionTitle>
        <ul className="grid gap-3 sm:grid-cols-2">
          {view.situations.map((s) => {
            const p = progress.get(s.id)
            return (
              <li key={s.id}>
                <Link to={`/situation/${s.id}?tab=tutor`} className={linkCard}>
                  <LevelBadge level={s.level} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{s.title}</span>
                    <span className="block font-serif text-sm text-ink-muted italic" lang="pt-PT">
                      {s.titlePt}
                    </span>
                  </span>
                  <StatusBadge status={p?.status ?? 'not-started'} />
                  {chevron}
                </Link>
              </li>
            )
          })}
        </ul>
        <p className="text-sm text-ink-muted">
          Тексты и словари тоже можно отработать с агентом — раздел «Практика с агентом» внизу страницы в{' '}
          <Link to="/library">Библиотеке</Link>.
        </p>
      </section>

      <section className="space-y-3">
        <SectionTitle icon={<History className="size-5" />} tone="bg-surface-2 text-ink-muted">
          История занятий
        </SectionTitle>
        {view.history.length === 0 ? (
          <div className="rounded-card border border-dashed border-line-strong">
            <EmptyState
              compact
              tone="neutral"
              icon={<History className="size-5" />}
              title="Пока нет отмеченных занятий"
              text="После сессии с агентом нажмите «Отметить пройденным» — она появится здесь."
            />
          </div>
        ) : (
          <ul className="card divide-y divide-line p-0">
            {view.history.map((h) => (
              <li key={`${h.at}-${h.mode}`} className="space-y-0.5 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-ink-muted">
                    {new Date(h.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="font-semibold">{modeTitle(h.mode)}</span>
                  <span className="ml-auto rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand-ink tabular-nums">
                    {h.correct}/{h.total}
                  </span>
                </div>
                <p>
                  {h.itemIds.map((id, i) => {
                    const item = resolveTutorItem(id)
                    return (
                      <span key={id}>
                        {i > 0 && ' · '}
                        {item ? <Link to={item.to}>{item.title}</Link> : id}
                      </span>
                    )
                  })}
                </p>
                {h.note && <p className="text-ink-muted break-words whitespace-pre-line">{h.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
