import type { TopicStatus } from '@/data'
import { STATUS_LABEL } from './status'

const STATUS_STYLE: Record<TopicStatus, string> = {
  'not-started': 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
  weak: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  learning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  confident: 'bg-brand-100 text-brand-800 dark:bg-brand-800/40 dark:text-brand-100',
}

export function StatusBadge({ status, className = '' }: { status: TopicStatus; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[status]} ${className}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function LevelBadge({ level, className = '' }: { level: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md bg-brand-700 px-1.5 py-0.5 text-xs font-bold tracking-wide text-white ${className}`}
    >
      {level}
    </span>
  )
}
