import type { TopicStatus } from '@/data'
import type { BadgeTone } from './tones'

/**
 * THE topic status system (one vocabulary, one colour mapping) — used by StatusBadge, the syllabus,
 * the dashboard, result screens and the library. Weak is terracotta (warm, not a scolding red).
 */
export const STATUS: Record<TopicStatus, { label: string; tone: BadgeTone; dot: string; bar: string }> = {
  'not-started': { label: 'Не начато', tone: 'neutral', dot: 'bg-line-strong', bar: 'bg-line-strong' },
  weak: { label: 'Слабо', tone: 'terracotta', dot: 'bg-terracotta-fill', bar: 'bg-terracotta-fill' },
  learning: { label: 'Изучаю', tone: 'sun', dot: 'bg-sun-fill', bar: 'bg-sun-fill' },
  confident: { label: 'Уверенно', tone: 'brand', dot: 'bg-brand', bar: 'bg-brand' },
}

/** Display order for stacked bars / legends. */
export const STATUS_ORDER: readonly TopicStatus[] = ['confident', 'learning', 'weak', 'not-started']

/** @deprecated use STATUS[s].label */
export const STATUS_LABEL: Record<TopicStatus, string> = {
  'not-started': STATUS['not-started'].label,
  weak: STATUS.weak.label,
  learning: STATUS.learning.label,
  confident: STATUS.confident.label,
}
