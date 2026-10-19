import type { TopicStatus } from '@/data'

export const STATUS_LABEL: Record<TopicStatus, string> = {
  'not-started': 'не начато',
  weak: 'слабо',
  learning: 'в процессе',
  confident: 'уверенно',
}
