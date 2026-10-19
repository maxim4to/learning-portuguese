import { Link } from 'react-router-dom'
import { getSyllabus } from '@/content'
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

/** Friendly page for a topic that the syllabus lists but whose JSON doesn't exist yet (or an unknown id). */
export function MissingTopicPage({ id }: { id: string }) {
  const where = findInSyllabus(id)
  return (
    <div className="mx-auto max-w-xl space-y-4 py-6 text-center">
      <p className="text-5xl" aria-hidden>
        🚧
      </p>
      {where ? (
        <>
          <h1>Тема ещё не сгенерирована</h1>
          <p className="flex flex-wrap items-center justify-center gap-2 text-stone-600 dark:text-stone-400">
            <LevelBadge level={where.level} />
            <span>
              {where.module.title} · тема {where.position} из {where.module.topics.length}
            </span>
          </p>
          <p className="text-stone-600 dark:text-stone-400">
            Тема <code className="rounded bg-stone-100 px-1.5 py-0.5 text-sm dark:bg-stone-800">{id}</code> есть в программе
            курса, но материалы для неё ещё не готовы. Её можно сгенерировать командой{' '}
            <code className="rounded bg-stone-100 px-1.5 py-0.5 text-sm dark:bg-stone-800">npm run generate</code>.
          </p>
        </>
      ) : (
        <>
          <h1>Тема не найдена</h1>
          <p className="text-stone-600 dark:text-stone-400">
            Темы <code className="rounded bg-stone-100 px-1.5 py-0.5 text-sm dark:bg-stone-800">{id}</code> нет в программе курса.
          </p>
        </>
      )}
      <Link to="/syllabus" className="btn-primary no-underline">
        К курсу
      </Link>
    </div>
  )
}
