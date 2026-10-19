import type { TopicStatus } from '@/data'
import { Badge } from './Badge'
import { cx } from './cx'
import { STATUS } from './status'

/** The only renderer of a topic status. */
export function StatusBadge({ status, className = '' }: { status: TopicStatus; className?: string }) {
  const s = STATUS[status]
  return (
    <Badge tone={s.tone} className={className}>
      <i aria-hidden className={cx('size-1.5 rounded-full', s.dot)} />
      {s.label}
    </Badge>
  )
}

/** CEFR level: azulejo blue, deepening A1 → B2. */
const LEVEL_TONE: Record<string, string> = {
  A1: 'bg-azulejo-soft text-azulejo-ink ring-1 ring-inset ring-azulejo/25',
  A2: 'bg-azulejo-soft text-azulejo-ink ring-1 ring-inset ring-azulejo/45',
  B1: 'bg-azulejo text-surface',
  B2: 'bg-[color-mix(in_oklab,var(--azulejo)_75%,var(--ink))] text-surface',
}

export function LevelBadge({ level, className = '' }: { level: string; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-xs font-bold tracking-wide tabular-nums',
        LEVEL_TONE[level] ?? LEVEL_TONE.A1,
        className,
      )}
    >
      {level}
    </span>
  )
}
