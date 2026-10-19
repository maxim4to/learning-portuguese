import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { LEVELS } from '@/content'
import { Chip, ChipGroup } from '@/components/Chip'
import { EmptyState } from '@/components/EmptyState'
import type { LevelFilter } from './levels'

/** «Все · A1 · A2 …» chips with per-level counts (levels without items stay visible but muted). */
export function LevelChips<T extends { level?: string }>({
  items,
  value,
  onChange,
}: {
  items: T[]
  value: LevelFilter
  onChange(l: LevelFilter): void
}) {
  return (
    <ChipGroup
      label="Фильтр по уровню"
      // Phones: one row that scrolls (edge to edge) instead of a lone chip wrapping onto a second line.
      className="scroll-fade-x max-sm:-mx-4 max-sm:-my-1 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-4 max-sm:py-1"
    >
      {(['all', ...LEVELS] as LevelFilter[]).map((l) => {
        const n = l === 'all' ? items.length : items.filter((i) => i.level === l).length
        return (
          <Chip key={l} pressed={value === l} count={n} muted={!n} onClick={() => onChange(l)}>
            {l === 'all' ? 'Все' : l}
          </Chip>
        )
      })}
    </ChipGroup>
  )
}

/** Level group heading: «A2 · 5 текстов». */
export function GroupTitle({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <h2>{title}</h2>
      {hint && <span className="text-sm font-semibold text-ink-muted">{hint}</span>}
    </div>
  )
}

/** Empty frame that keeps the section's place. */
export function EmptyFrame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line-strong">
      <EmptyState compact tone="neutral" title={children} />
    </div>
  )
}

export function RowChevron() {
  return <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
}
