import { BookA, Layers } from 'lucide-react'
import { SubNav } from '@/components/SubNav'

/**
 * Sub-sections of «Повторение» (one bottom-bar slot): the SRS deck (/review) and the personal
 * dictionary (/words) — separate routes, the same quiet second-level SubNav as «Практика».
 */
export function ReviewTabs({ active, wordCount }: { active: 'review' | 'words'; wordCount?: number }) {
  return (
    <SubNav
      label="Разделы повторения"
      active={active}
      items={[
        {
          value: 'review',
          to: '/review',
          label: (
            <>
              <Layers aria-hidden className="size-4" /> Карточки
            </>
          ),
        },
        {
          value: 'words',
          to: '/words',
          label: (
            <>
              <BookA aria-hidden className="size-4" /> Мой словарь
            </>
          ),
          meta: wordCount || undefined,
        },
      ]}
    />
  )
}
