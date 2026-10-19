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

/** CEFR level: stone → sulfur → violet → obsidian as the level deepens (A1 → B2). */
const LEVEL_TONE: Record<string, string> = {
  A1: 'bg-azulejo-soft text-ink',
  A2: 'bg-sun-soft text-sun',
  B1: 'bg-terracotta-soft text-terracotta',
  B2: 'bg-ink text-surface',
}

export function LevelBadge({ level, className = '' }: { level: string; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-pill px-2 py-0.5 text-xs font-bold tabular-nums',
        LEVEL_TONE[level] ?? LEVEL_TONE.A1,
        className,
      )}
    >
      {level}
    </span>
  )
}
