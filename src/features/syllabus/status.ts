import { BADGE_TONE } from '@/components/tones'
import { STATUS, STATUS_ORDER } from '@/components/status'
import type { TopicStatus } from '@/data/types.ts'

/**
 * Compatibility view of the single status system in `@/components/status` (labels and colours are defined there).
 * Kept for callers that still read `STATUS_META[s].chip/.dot/.bar`.
 */
type Meta = { label: string; dot: string; bar: string; chip: string }
const meta = (s: TopicStatus): Meta => ({ label: STATUS[s].label, dot: STATUS[s].dot, bar: STATUS[s].bar, chip: BADGE_TONE[STATUS[s].tone] })

export const STATUS_META: Record<TopicStatus, Meta> = {
  'not-started': meta('not-started'),
  weak: meta('weak'),
  learning: meta('learning'),
  confident: meta('confident'),
}

export { STATUS_ORDER }

export const pct = (x: number) => `${Math.round(x * 100)}%`
