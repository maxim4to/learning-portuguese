import { Link } from 'react-router-dom'
import { getModule, getTopic, type Topic } from '@/content'
import type { TopicProgress } from '@/data'
import { LevelBadge, StatusBadge } from '@/components/StatusBadge'

export function TopicHeader({ topic, progress }: { topic: Topic; progress: Map<string, TopicProgress> }) {
  const mod = getModule(topic.module)
  const own = progress.get(topic.id)
  return (
    <header className="space-y-3">
      <nav className="text-sm">
        <Link to="/syllabus" className="no-underline hover:underline">
          ← Курс
        </Link>
        {mod && <span className="text-stone-500"> · {mod.module.title}</span>}
      </nav>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <LevelBadge level={topic.level} />
          <StatusBadge status={own?.status ?? 'not-started'} />
          {own && (
            <span className="text-xs text-stone-500">
              последний результат {Math.round(own.lastPct * 100)}% · попыток {own.attempts}
            </span>
          )}
        </div>
        <h1 className="text-[1.6rem] leading-tight sm:text-3xl">{topic.title}</h1>
        <p className="text-lg text-stone-500 italic dark:text-stone-400" lang="pt-PT">
          {topic.titlePt}
        </p>
      </div>
      {topic.requires.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="text-stone-500">Сначала:</span>
          {topic.requires.map((id) => {
            const t = getTopic(id)
            const st = progress.get(id)?.status ?? 'not-started'
            return (
              <Link
                key={id}
                to={`/topic/${id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 py-1 no-underline hover:border-brand-500 dark:border-stone-800 dark:bg-stone-900"
              >
                <span className="text-stone-800 dark:text-stone-200">{t?.title ?? id}</span>
                <StatusBadge status={st} />
              </Link>
            )
          })}
        </div>
      )}
    </header>
  )
}
