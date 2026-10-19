import { Construction, SearchX } from 'lucide-react'
import { getSyllabus } from '@/content'
import { ButtonLink } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { LevelBadge } from '@/components/StatusBadge'

/** Where a topic id is listed in the syllabus (if at all). */
function findInSyllabus(id: string) {
  for (const lvl of getSyllabus().levels)
    for (const mod of lvl.modules) {
      const i = mod.topics.indexOf(id)
      if (i !== -1) return { level: lvl.level, module: mod, position: i + 1 }
    }
  return undefined
}

const code = 'rounded-md bg-surface-2 px-1.5 py-0.5 text-sm'

/** Friendly page for a topic that the syllabus lists but whose JSON doesn't exist yet (or an unknown id). */
export function MissingTopicPage({ id }: { id: string }) {
  const where = findInSyllabus(id)
  return (
    <div className="card mx-auto max-w-xl">
      {where ? (
        <EmptyState
          icon={<Construction className="size-7" />}
          tone="sun"
          title="Тема ещё не готова"
          text={
            <>
              <span className="mb-2 flex flex-wrap items-center justify-center gap-2">
                <LevelBadge level={where.level} />
                {where.module.title} · тема {where.position} из {where.module.topics.length}
              </span>
              Тема <code className={code}>{id}</code> есть в программе курса, но материалы для неё ещё не готовы.
            </>
          }
          action={<ButtonLink to="/syllabus">К курсу</ButtonLink>}
        />
      ) : (
        <EmptyState
          icon={<SearchX className="size-7" />}
          tone="neutral"
          title="Тема не найдена"
          text={
            <>
              Темы <code className={code}>{id}</code> нет в программе курса.
            </>
          }
          action={<ButtonLink to="/syllabus">К курсу</ButtonLink>}
        />
      )}
    </div>
  )
}
