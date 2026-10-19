import { createElement } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MessagesSquare } from 'lucide-react'
import { Chip, ChipGroup } from '@/components/Chip'
import { cx } from '@/components/cx'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { plural } from '@/features/library/format'
import { sceneIcon, sceneTint } from './sceneIcon'
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
    <div className="space-y-6">
      <div className="space-y-4">
        <MaterialsTabs active="situations" />
        <PageHeader
          title="Ситуации"
          subtitle="Диалоги из жизни в Португалии: слушайте, разыгрывайте по ролям, учите фразы и слова."
        />
      </div>

      {situations.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<MessagesSquare className="size-7" />}
            tone="azulejo"
            title="Ситуаций пока нет"
            text="Модули «в кафе», «у врача», «в Finanças» и другие скоро появятся."
          />
        </div>
      ) : (
        <>
          <ChipGroup label="Фильтр по уровню">
            {(['all', ...LEVELS] as Filter[]).map((l) => {
              const n = l === 'all' ? situations.length : situations.filter((s) => s.level === l).length
              return (
                <Chip
                  key={l}
                  pressed={filter === l}
                  count={n}
                  muted={!n}
                  onClick={() => setParams(l === 'all' ? {} : { level: l }, { replace: true })}
                >
                  {l === 'all' ? 'Все' : l}
                </Chip>
              )
            })}
          </ChipGroup>

          {groups.length === 0 && <p className="card text-sm text-ink-muted">На уровне {filter} ситуаций пока нет.</p>}

          {groups.map((g) => (
            <section key={g.level} className="space-y-3">
              <h2 className="flex items-baseline gap-3 pt-4 font-display text-[3.5rem] leading-[0.85] font-black md:text-display">
                {g.level}
                <span className="font-sans text-sm font-semibold tracking-normal text-ink-muted">· {g.items.length}</span>
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
    <Link to={`/situation/${s.id}`} className="card card-link flex h-full flex-col gap-4 sm:p-6">
      <span className="flex items-center justify-between gap-2">
        <span aria-hidden className={cx('grid size-14 shrink-0 place-items-center rounded-full', sceneTint(s.id))}>
          {createElement(sceneIcon(s.id), { className: 'size-6', strokeWidth: 1.8 })}
        </span>
        <LevelBadge level={s.level} className="shrink-0" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-3">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block font-display text-[1.75rem] leading-[1.02]">{s.title}</span>
            <span className="block font-pt text-sm text-ink-muted" lang="pt-PT">
              {s.titlePt}
            </span>
          </span>
        </span>
        <span className="rule-dotted mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-ink-muted">
          <StatusBadge status={progress?.status ?? 'not-started'} />
          {progress && <span className="tabular-nums">лучший {Math.round(progress.bestPct * 100)}%</span>}
          <span>
            {plural(s.dialogue.length, 'реплика', 'реплики', 'реплик')} · {plural(s.vocab.length, 'слово', 'слова', 'слов')} ·{' '}
            {plural(s.exercises.length, 'задание', 'задания', 'заданий')}
          </span>
        </span>
      </span>
    </Link>
  )
}
