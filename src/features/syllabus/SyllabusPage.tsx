import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, BookOpen, ChevronRight, ClipboardCheck, Target } from 'lucide-react'
import { Chip, ChipGroup } from '@/components/Chip'
import { PageSkeleton } from '@/components/EmptyState'
import { Illustration } from '@/components/Illustration'
import { levelArt } from '@/components/illustrations'
import { PageHeader } from '@/components/PageHeader'
import { ProgressBar } from '@/components/ProgressBar'
import { LevelBadge } from '@/components/StatusBadge'
import { LEVELS, getSyllabus, getTopic, type Level, type SyllabusModule } from '@/content'
import type { TopicProgress, TopicStatus } from '@/data/types.ts'
import { primarySuggestion } from '@/features/dashboard/stats'
import { useProgressData } from '@/features/dashboard/useProgressData'
import { STATUS_META, STATUS_ORDER, pct } from './status'

type Filter = Level | 'all'

export function SyllabusPage() {
  const syllabus = getSyllabus()
  const { progress, loading } = useProgressData()
  const [params, setParams] = useSearchParams()
  const raw = params.get('level')
  const filter: Filter = raw && (LEVELS as readonly string[]).includes(raw) ? (raw as Level) : 'all'

  const next = useMemo(() => (loading ? undefined : primarySuggestion(progress)), [progress, loading])
  const levels = syllabus.levels.filter((l) => filter === 'all' || l.level === filter)

  return (
    <div className="page">
      <PageHeader
        title="Курс"
        subtitle="Грамматика европейского португальского от A1 до B2 — тема за темой."
        actions={
          <Link
            to="/diagnostic"
            className="btn-secondary"
          >
            <ClipboardCheck aria-hidden className="size-4.5" /> Диагностика
          </Link>
        }
      >
        <ChipGroup label="Уровень">
          {(['all', ...LEVELS] as Filter[]).map((l) => {
            const has = l === 'all' || syllabus.levels.some((x) => x.level === l && x.modules.length > 0)
            return (
              <Chip
                key={l}
                pressed={filter === l}
                muted={!has}
                onClick={() => setParams(l === 'all' ? {} : { level: l }, { replace: true })}
              >
                {l === 'all' ? 'Все уровни' : l}
              </Chip>
            )
          })}
        </ChipGroup>
      </PageHeader>

      {next && (
        <Link
          to={`/topic/${next.topic.id}`}
          className="card-raised card-link group relative flex items-center gap-4 overflow-hidden"
        >
          <span
            aria-hidden
            className={`grid size-14 shrink-0 place-items-center rounded-full ${next.reason === 'next' ? 'bg-brand text-on-brand' : 'bg-terracotta-fill text-on-terracotta'}`}
          >
            {next.reason === 'next' ? <BookOpen className="size-6" /> : <Target className="size-6" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm text-ink-muted">
              <LevelBadge level={next.topic.level} />
              {next.reason === 'next' ? 'Продолжить курс' : 'Подтянуть слабую тему'}
            </span>
            <span className="mt-1 block font-display text-h2 text-balance">{next.topic.title}</span>
          </span>
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-ink text-surface transition-transform group-hover:translate-x-0.5">
            <ArrowRight className="size-5" />
          </span>
        </Link>
      )}

      {/* Skeleton only on the very first open (no device snapshot yet): never a list without progress. */}
      {loading ? (
        <PageSkeleton cards={3} />
      ) : (
        levels.map((lvl) => (
          <section key={lvl.level} className="space-y-4" aria-label={`Уровень ${lvl.level}`}>
            <LevelHeader level={lvl.level} modules={lvl.modules} progress={progress} />
            {lvl.modules.length === 0 && <p className="card text-sm text-ink-muted">Скоро</p>}
            {lvl.modules.map((mod) => (
              <ModuleCard key={mod.id} mod={mod} progress={progress} />
            ))}
          </section>
        ))
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-muted">
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
    <div className="z-10 flex items-center gap-4 bg-bg pt-2 pb-3 md:sticky md:top-(--sticky-top) md:-mx-2 md:px-2">
      <Illustration name={levelArt(level)} sizes="56px" className="size-12 shrink-0 rounded-2xl md:size-14" />
      <h2 className="shrink-0 font-black">{level}</h2>
      {ids.length > 0 && (
        <>
          <ProgressBar
            className="flex-1"
            label={`Уровень ${level}, тем ${ids.length}; не начато ${c['not-started']}`}
            segments={STATUS_ORDER.filter((s) => s !== 'not-started').map((s) => ({
              value: c[s] / ids.length,
              className: STATUS_META[s].bar,
              title: `${STATUS_META[s].label}: ${c[s]}`,
            }))}
          />
          <span className="shrink-0 font-display text-h2 text-ink tabular-nums">
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
    <div className="card overflow-hidden p-0">
      <div className="flex flex-col gap-1 px-5 pt-5 pb-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3 lg:px-6">
        <h3 className="font-display text-h2 font-extrabold">{mod.title}</h3>
        <span className="shrink-0 text-sm font-semibold text-ink-muted tabular-nums">
          {mod.topics.length - c['not-started']}/{mod.topics.length} начато
        </span>
      </div>
      {/* Two columns from lg (course order runs down the first, then the second), so rows use the container width. */}
      <ul className="mx-3 pb-2 sm:mx-4 lg:columns-2 lg:gap-x-8 [&>li]:break-inside-avoid">
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
      <li className="flex items-center gap-3 px-4 py-3 text-ink-muted" aria-disabled>
        <i className={`size-2.5 shrink-0 rounded-full ${STATUS_META['not-started'].dot}`} />
        <span className="min-w-0 flex-1 truncate">{humanizeId(id)}</span>
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold">скоро</span>
      </li>
    )
  }

  const unmet = t.requires.filter((r) => {
    const s = progress.get(r)?.status
    return s !== 'confident' && s !== 'learning'
  })

  return (
    <li>
      <Link to={`/topic/${t.id}`} className="group flex min-h-16 items-center gap-3 rounded-control px-2 py-3 text-ink no-underline transition-[background-color,transform] duration-150 hover:bg-surface-2 active:scale-[0.99] motion-reduce:active:scale-100">
        <i className={`size-3 shrink-0 rounded-full ${meta.dot}`} />
        <span className="min-w-0 flex-1">
          <span className="block leading-snug font-semibold">{t.title}</span>
          <span className="block font-pt text-sm text-pretty text-ink-muted sm:truncate" lang="pt-PT">
            {t.titlePt}
          </span>
          {status === 'not-started' && unmet.length > 0 && (
            <span className="line-clamp-2 text-sm text-ink-muted sm:line-clamp-1">
              Лучше сначала: {unmet.map((r) => getTopic(r)?.title ?? humanizeId(r)).join(', ')}
            </span>
          )}
          <span className="sr-only">. Статус: {meta.label}</span>
        </span>
        {p && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${meta.chip}`}>{pct(p.lastPct)}</span>}
        <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  )
}

/** "a2-preterito-imperfeito" → "preterito imperfeito" (for topics not written yet). */
function humanizeId(id: string) {
  return id.replace(/^[ab][12]-/, '').replace(/-/g, ' ')
}
