import { Link, useSearchParams } from 'react-router-dom'
import { LEVELS, listSituations, type Level, type Situation } from '@/content'
import type { TopicProgress } from '@/data'
import { LevelBadge, StatusBadge } from '@/components/StatusBadge'
import { useProgressMap } from '@/features/lessons/useTopicProgress'
import { MaterialsTabs } from '@/features/library/LibraryPage'

type Filter = Level | 'all'

export function SituationsPage() {
  const situations = listSituations()
  const { map: progress } = useProgressMap()
  const [params, setParams] = useSearchParams()
  const raw = params.get('level')
  const filter: Filter = raw && (LEVELS as readonly string[]).includes(raw) ? (raw as Level) : 'all'

  const groups = LEVELS.map((level) => ({
    level,
    items: situations.filter((s) => s.level === level).sort((a, b) => a.title.localeCompare(b.title, 'ru')),
  })).filter((g) => g.items.length > 0 && (filter === 'all' || g.level === filter))

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <MaterialsTabs active="situations" />
        <h1>Ситуации</h1>
        <p className="text-stone-600 dark:text-stone-400">Диалоги из жизни в Португалии: слушайте, разыгрывайте по ролям, учите фразы и слова.</p>
      </div>

      {situations.length === 0 ? (
        <div className="card space-y-1 text-center">
          <p className="text-2xl" aria-hidden>
            💬
          </p>
          <p className="font-medium">Ситуаций пока нет</p>
          <p className="text-sm text-stone-500">Модули «в кафе», «у врача», «в Finanças» и другие скоро появятся.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Фильтр по уровню">
            {(['all', ...LEVELS] as Filter[]).map((l) => {
              const n = l === 'all' ? situations.length : situations.filter((s) => s.level === l).length
              return (
                <button
                  key={l}
                  type="button"
                  aria-pressed={filter === l}
                  onClick={() => setParams(l === 'all' ? {} : { level: l }, { replace: true })}
                  className={`rounded-full border px-3.5 py-1 text-sm font-medium ${
                    filter === l
                      ? 'border-brand-700 bg-brand-700 text-white'
                      : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800'
                  } ${n ? '' : 'opacity-60'}`}
                >
                  {l === 'all' ? 'Все' : l}
                  <span className="ml-1 opacity-70 tabular-nums">{n}</span>
                </button>
              )
            })}
          </div>

          {groups.length === 0 && (
            <p className="card text-sm text-stone-500">На уровне {filter} ситуаций пока нет.</p>
          )}

          {groups.map((g) => (
            <section key={g.level} className="space-y-3">
              <h2 className="flex items-center gap-2">
                {g.level}
                <span className="text-sm font-normal text-stone-500">· {g.items.length}</span>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {g.items.map((s) => (
                  <li key={s.id}>
                    <SituationCard situation={s} progress={progress.get(s.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  )
}

function SituationCard({ situation: s, progress }: { situation: Situation; progress?: TopicProgress }) {
  return (
    <Link
      to={`/situation/${s.id}`}
      className="card flex h-full flex-col gap-2 no-underline transition hover:border-brand-500 focus-visible:border-brand-500"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block font-semibold text-stone-900 dark:text-stone-100">{s.title}</span>
          <span className="block text-sm text-stone-500 italic dark:text-stone-400" lang="pt-PT">
            {s.titlePt}
          </span>
        </span>
        <LevelBadge level={s.level} className="shrink-0" />
      </span>
      <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
        <StatusBadge status={progress?.status ?? 'not-started'} />
        {progress && <span className="tabular-nums">лучший {Math.round(progress.bestPct * 100)}%</span>}
        <span>
          {s.dialogue.length} реплик · {s.vocab.length} слов · {s.exercises.length} упр.
        </span>
      </span>
    </Link>
  )
}
