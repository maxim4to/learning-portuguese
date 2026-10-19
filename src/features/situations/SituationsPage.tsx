import { Link, useSearchParams } from 'react-router-dom'
import { MessagesSquare } from 'lucide-react'
import { Chip, ChipGroup } from '@/components/Chip'
import { Illustration } from '@/components/Illustration'
import { situationArt } from '@/components/illustrations'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { plural } from '@/features/library/format'
import { LEVELS, listSituations, type Level, type Situation } from '@/content'
import type { TopicProgress } from '@/data'
import { StatusBadge } from '@/components/StatusBadge'
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
                  onClick={() =>
                    setParams(l === 'all' ? {} : { level: l }, {
                      replace: true,
                    })
                  }
                >
                  {l === 'all' ? 'Все' : l}
                </Chip>
              )
            })}
          </ChipGroup>

          {groups.length === 0 && <p className="card text-sm text-ink-muted">На уровне {filter} ситуаций пока нет.</p>}

          {groups.map((g) => (
            <section key={g.level} className="space-y-3">
              <div className="flex items-baseline gap-3 pt-4">
                <h2>{g.level}</h2>
                <span className="text-sm font-semibold text-ink-muted">{plural(g.items.length, 'ситуация', 'ситуации', 'ситуаций')}</span>
              </div>
              <ul className="card divide-y divide-line p-0">
                {g.items.map((s) => (
                  <li key={s.id} className="first:[&>a]:rounded-t-card last:[&>a]:rounded-b-card">
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

/** Compact list row: 56px cover, title + Portuguese title, muted counts, status on the right. */
function SituationCard({ situation: s, progress }: { situation: Situation; progress?: TopicProgress }) {
  return (
    <Link
      to={`/situation/${s.id}`}
      className="group flex min-h-[4.5rem] items-center gap-3 px-3 py-2.5 no-underline transition-colors hover:bg-surface-2 sm:gap-4 sm:px-4"
    >
      <Illustration name={situationArt(s.id)} sizes="56px" className="size-14 shrink-0 rounded-[0.875rem] object-cover" />
      <span className="min-w-0 flex-1">
        <span className="block leading-tight font-semibold text-ink">{s.title}</span>
        <span className="mt-0.5 block truncate text-sm text-ink-muted">
          <span lang="pt-PT" className="font-pt">
            {s.titlePt}
          </span>
          <span className="max-sm:hidden">
            {' · '}
            {plural(s.dialogue.length, 'реплика', 'реплики', 'реплик')} · {plural(s.vocab.length, 'слово', 'слова', 'слов')}
          </span>
        </span>
        <span className="mt-0.5 block text-xs text-ink-muted sm:hidden">
          {plural(s.dialogue.length, 'реплика', 'реплики', 'реплик')} · {plural(s.vocab.length, 'слово', 'слова', 'слов')}
        </span>
      </span>
      {/* Status only once started: a column of «Не начато» on every row is noise and squeezes the title on phones. */}
      {progress && progress.status !== 'not-started' && (
        <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-ink-muted">
          <StatusBadge status={progress.status} />
          <span className="tabular-nums">{Math.round(progress.bestPct * 100)}%</span>
        </span>
      )}
    </Link>
  )
}
