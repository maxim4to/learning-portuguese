import { Search } from 'lucide-react'
import { cx } from '@/components/cx'
import { useWordCapture } from './context.ts'

/** Header button for the word search (same as «/» or Ctrl/⌘+K). */
export function WordSearchButton({ className }: { className?: string }) {
  const capture = useWordCapture()
  if (!capture) return null
  return (
    <button
      type="button"
      onClick={capture.openSearch}
      aria-label="Найти слово"
      aria-keyshortcuts="/ Control+K Meta+K"
      title="Найти слово ( / )"
      className={cx('btn-ghost btn-icon shrink-0', className)}
    >
      <Search aria-hidden />
    </button>
  )
}
