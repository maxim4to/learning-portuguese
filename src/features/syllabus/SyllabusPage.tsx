import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LEVELS, getSyllabus, getTopic, type Level, type SyllabusModule } from '@/content'
import type { TopicProgress, TopicStatus } from '@/data/types.ts'
import { suggestTopics } from '@/features/dashboard/stats'
import { useProgressData } from '@/features/dashboard/useProgressData'
import { STATUS_META, STATUS_ORDER, pct } from './status'

type Filter = Level | 'all'

export function SyllabusPage() {
  const syllabus = getSyllabus()
  const { progress, loading } = useProgressData()
  const [params, setParams] = useSearchParams()
  const raw = params.get('level')
  const filter: Filter = raw && (LEVELS as readonly string[]).includes(raw) ? (raw as Level) : 'all'

  const next = useMemo(() => (loading ? undefined : suggestTopics(progress, 1)[0]), [progress, loading])
  const levels = syllabus.levels.filter((l) => filter === 'all' || l.level === filter)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1>Курс</h1>
        <Link to="/diagnostic" className="text-sm">
          Диагностика →
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Уровень">
        {(['all', ...LEVELS] as Filter[]).map((l) => {
          const has = l === 'all' || syllabus.levels.some((x) => x.level === l && x.modules.length > 0)
          return (
            <button
              key={l}
              role="tab"
              aria-selected={filter === l}
              onClick={() => setParams(l === 'all' ? {} : { level: l }, { replace: true })}
              className={`rounded-full border px-3.5 py-1 text-sm font-medium ${
                filter === l
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800'
              } ${has ? '' : 'opacity-60'}`}
            >
              {l === 'all' ? 'Все' : l}
            </button>
          )
        })}
      </div>

      {next && (
        <Link
          to={`/topic/${next.topic.id}`}
          className="card flex items-center gap-3 border-brand-500/40 bg-brand-50/60 no-underline hover:border-brand-500 dark:bg-brand-800/15"
        >
          <span className="text-2xl" aria-hidden>
            {next.reason === 'next' ? '📖' : '🎯'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-stone-500">{next.reason === 'next' ? 'Продолжить курс' : 'Подтянуть слабую тему'}</span>
            <span className="block truncate font-medium text-stone-900 dark:text-stone-100">
              {next.topic.level} · {next.topic.title}
            </span>
          </span>
          <span className="text-brand-700 dark:text-brand-500">→</span>
        </Link>
      )}

      {levels.map((lvl) => (
        <section key={lvl.level} className="space-y-3">
          <LevelHeader level={lvl.level} modules={lvl.modules} progress={progress} />
          {lvl.modules.length === 0 && <p className="card text-sm text-stone-500">Скоро</p>}
          {lvl.modules.map((mod) => (
            <ModuleCard key={mod.id} mod={mod} progress={progress} />
          ))}
        </section>
      ))}

      <div className="flex flex-wrap gap-3 text-xs text-stone-500">
        {STATUS_ORDER.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <i className={`inline-block size-2.5 rounded-full ${STATUS_META[s].dot}`} />
            {STATUS_META[s].label}
          </span>
        ))}
      </div>
    </div>
  )
}

function countStatuses(ids: string[], progress: Map<string, TopicProgress>) {
  const c: Record<TopicStatus, number> = { 'not-started': 0, weak: 0, learning: 0, confident: 0 }
  for (const id of ids) c[progress.get(id)?.status ?? 'not-started']++
  return c
}

function LevelHeader({ level, modules, progress }: { level: Level; modules: SyllabusModule[]; progress: Map<string, TopicProgress> }) {
  const ids = modules.flatMap((m) => m.topics)
  const c = countStatuses(ids, progress)
  return (
    <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 bg-stone-50/95 px-4 py-2 backdrop-blur md:top-[57px] md:-mx-6 md:px-6 dark:bg-stone-950/95">
      <h2 className="shrink-0">{level}</h2>
      {ids.length > 0 && (
        <>
          <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
            {STATUS_ORDER.filter((s) => s !== 'not-started').map((s) =>
              c[s] ? <div key={s} className={STATUS_META[s].bar} style={{ width: `${(c[s] / ids.length) * 100}%` }} /> : null,
            )}
          </div>
          <span className="shrink-0 text-sm text-stone-500 tabular-nums">
            {c.confident}/{ids.length}
          </span>
        </>
      )}
    </div>
  )
}

function ModuleCard({ mod, progress }: { mod: SyllabusModule; progress: Map<string, TopicProgress> }) {
  const c = countStatuses(mod.topics, progress)
  return (
    <div className="card p-0">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-2">
        <h3>{mod.title}</h3>
        <span className="shrink-0 text-xs text-stone-500">
          {mod.topics.length - c['not-started']}/{mod.topics.length} начато
        </span>
      </div>
      <ul className="divide-y divide-stone-100 dark:divide-stone-800">
        {mod.topics.map((tid) => (
          <TopicRow key={tid} id={tid} progress={progress} />
        ))}
      </ul>
    </div>
  )
}

function TopicRow({ id, progress }: { id: string; progress: Map<string, TopicProgress> }) {
  const t = getTopic(id)
  const p = progress.get(id)
  const status: TopicStatus = p?.status ?? 'not-started'
  const meta = STATUS_META[status]

  if (!t) {
    return (
      <li className="flex items-center gap-3 px-4 py-2.5 opacity-55" aria-disabled>
        <i className={`size-2.5 shrink-0 rounded-full ${STATUS_META['not-started'].dot}`} />
        <span className="min-w-0 flex-1 truncate text-stone-500">{humanizeId(id)}</span>
        <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500 dark:bg-stone-800">скоро</span>
      </li>
    )
  }

  const unmet = t.requires.filter((r) => {
    const s = progress.get(r)?.status
    return s !== 'confident' && s !== 'learning'
  })

  return (
    <li>
      <Link to={`/topic/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 no-underline hover:bg-stone-50 dark:hover:bg-stone-800/50">
        <i className={`size-2.5 shrink-0 rounded-full ${meta.dot}`} title={meta.label} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-stone-900 dark:text-stone-100">{t.title}</span>
          <span className="block truncate text-sm text-stone-500 italic">{t.titlePt}</span>
          {status === 'not-started' && unmet.length > 0 && (
            <span className="block truncate text-xs text-stone-400">
              Лучше сначала: {unmet.map((r) => getTopic(r)?.title ?? humanizeId(r)).join(', ')}
            </span>
          )}
        </span>
        {p ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${meta.chip}`}>{pct(p.lastPct)}</span>
        ) : (
          <span className="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden>
            →
          </span>
        )}
      </Link>
    </li>
  )
}

/** "a2-preterito-imperfeito" → "preterito imperfeito" (for topics not written yet). */
function humanizeId(id: string) {
  return id.replace(/^[ab][12]-/, '').replace(/-/g, ' ')
}
