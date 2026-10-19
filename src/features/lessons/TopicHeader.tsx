import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { getModule, getTopic, type Topic } from '@/content'
import type { TopicProgress } from '@/data'
import { PageHeader } from '@/components/PageHeader'
import { LevelBadge, StatusBadge } from '@/components/StatusBadge'

/**
 * Topic title block. `compact` (exercises / mini-test tabs): one line — back arrow, 16px title, status —
 * so the exercise prompt below is the largest text on the screen.
 */
export function TopicHeader({
  topic,
  progress,
  compact = false,
}: {
  topic: Topic
  progress: Map<string, TopicProgress>
  compact?: boolean
}) {
  const mod = getModule(topic.module)
  const own = progress.get(topic.id)
  const backLabel = mod ? `Курс · ${mod.module.title}` : 'Курс'

  if (compact) {
    return (
      <header className="flex min-h-11 items-center gap-2">
        <Link
          to="/syllabus"
          aria-label={backLabel}
          title={backLabel}
          className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full text-ink no-underline transition-colors hover:bg-surface print:hidden"
        >
          <ChevronLeft aria-hidden className="size-5" strokeWidth={2.25} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-sans text-base leading-snug font-semibold tracking-normal">{topic.title}</h1>
        <span className="flex shrink-0 items-center gap-2 text-sm text-ink-muted tabular-nums">
          {own && <span className="hidden sm:inline">{Math.round(own.lastPct * 100)}%</span>}
          <StatusBadge status={own?.status ?? 'not-started'} />
        </span>
      </header>
    )
  }

  return (
    <PageHeader
      back={{ to: '/syllabus', label: backLabel }}
      title={topic.title}
      meta={
        <>
          <LevelBadge level={topic.level} />
          <StatusBadge status={own?.status ?? 'not-started'} />
          {own && (
            <span className="tabular-nums">
              последний результат {Math.round(own.lastPct * 100)}% · попыток {own.attempts}
            </span>
          )}
        </>
      }
      subtitle={
        <p className="font-pt text-lg" lang="pt-PT">
          {topic.titlePt}
        </p>
      }
    >
      {topic.requires.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
          <span className="text-ink-muted">Сначала:</span>
          {topic.requires.map((id) => {
            const t = getTopic(id)
            const st = progress.get(id)?.status ?? 'not-started'
            return (
              <Link
                key={id}
                to={`/topic/${id}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-pill bg-surface py-1.5 pr-1.5 pl-4 text-ink no-underline transition-colors hover:bg-surface-2"
              >
                <span>{t?.title ?? id}</span>
                <StatusBadge status={st} />
              </Link>
            )
          })}
        </div>
      )}
    </PageHeader>
  )
}
