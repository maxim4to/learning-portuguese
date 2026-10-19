import { Link } from 'react-router-dom'
import { BookA, Layers } from 'lucide-react'
import { cx } from '@/components/cx'

/**
 * Sub-sections of «Повторение» (one bottom-bar slot): the SRS deck (/review) and the personal
 * dictionary (/words) — separate routes, same pattern as MaterialsTabs under «Практика».
 */
export function ReviewTabs({ active, wordCount }: { active: 'review' | 'words'; wordCount?: number }) {
  const tab = (on: boolean) =>
    cx(
      'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-pill px-4 text-sm font-semibold whitespace-nowrap no-underline transition-[background-color,color] sm:flex-none sm:px-5',
      on ? 'bg-ink text-surface' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
    )
  return (
    <nav aria-label="Разделы повторения" className="flex gap-1 rounded-pill bg-surface p-1 sm:inline-flex print:hidden">
      <Link to="/review" className={tab(active === 'review')} aria-current={active === 'review' ? 'page' : undefined}>
        <Layers aria-hidden className="size-4" /> Карточки
      </Link>
      <Link to="/words" className={tab(active === 'words')} aria-current={active === 'words' ? 'page' : undefined}>
        <BookA aria-hidden className="size-4" /> Мой словарь
        {wordCount !== undefined && wordCount > 0 && (
          <span className={cx('text-xs tabular-nums', active === 'words' ? 'text-on-ink-accent' : 'text-ink-muted')}>{wordCount}</span>
        )}
      </Link>
    </nav>
  )
}
