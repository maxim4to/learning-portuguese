import { Link } from 'react-router-dom'
import { getModule, getTopic, type Topic } from '@/content'
import type { TopicProgress } from '@/data'
import { PageHeader } from '@/components/PageHeader'
import { LevelBadge, StatusBadge } from '@/components/StatusBadge'

export function TopicHeader({ topic, progress }: { topic: Topic; progress: Map<string, TopicProgress> }) {
  const mod = getModule(topic.module)
  const own = progress.get(topic.id)
  return (
    <PageHeader
      back={{ to: '/syllabus', label: mod ? `Курс · ${mod.module.title}` : 'Курс' }}
      eyebrow={
        <>
          <LevelBadge level={topic.level} />
          <StatusBadge status={own?.status ?? 'not-started'} className="normal-case" />
          {own && (
            <span className="font-medium tracking-normal normal-case tabular-nums">
              последний результат {Math.round(own.lastPct * 100)}% · попыток {own.attempts}
            </span>
          )}
        </>
      }
      title={topic.title}
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
