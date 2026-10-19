import type { TopicStatus } from '@/data/types.ts'

/** Visual tokens for topic status (gray / red / yellow / green). */
export const STATUS_META: Record<TopicStatus, { label: string; dot: string; bar: string; chip: string }> = {
  'not-started': {
    label: 'Не начато',
    dot: 'bg-stone-300 dark:bg-stone-600',
    bar: 'bg-stone-200 dark:bg-stone-700',
    chip: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
  },
  weak: {
    label: 'Слабо',
    dot: 'bg-red-500',
    bar: 'bg-red-500',
    chip: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  },
  learning: {
    label: 'Изучаю',
    dot: 'bg-amber-400',
    bar: 'bg-amber-400',
    chip: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  },
  confident: {
    label: 'Уверенно',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  },
}

/** Display order for stacked bars / legends. */
export const STATUS_ORDER: readonly TopicStatus[] = ['confident', 'learning', 'weak', 'not-started']

export const pct = (x: number) => `${Math.round(x * 100)}%`
