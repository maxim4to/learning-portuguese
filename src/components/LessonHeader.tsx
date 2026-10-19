import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { LevelBadge } from './StatusBadge'

/**
 * Compact start of a lesson-like page (topic, situation): one line — back link, level, title (the page's h1) —
 * so the tabs and the content sit right under it. No status: it lives on the course map, the side panel and the
 * end screen. `below` is an optional quiet line (pt title, prerequisites) shown only where there's room for it.
 */
export function LessonHeader({
  back,
  level,
  title,
  icon,
  below,
}: {
  back: { to: string; label: string; title?: string }
  level: string
  title: ReactNode
  icon?: ReactNode
  below?: ReactNode
}) {
  return (
    <header className="space-y-1">
      <div className="flex min-h-11 items-center gap-x-2">
        <Link
          to={back.to}
          title={back.title ?? back.label}
          className="-ml-2.5 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-0.5 rounded-pill pr-1 pl-1.5 text-sm font-semibold text-ink-muted no-underline transition-colors hover:bg-surface hover:text-ink sm:pr-3 print:hidden"
        >
          <ChevronLeft aria-hidden className="size-5" strokeWidth={2.25} />
          <span className="max-sm:sr-only">{back.label}</span>
        </Link>
        <span aria-hidden className="h-5 w-px shrink-0 bg-line-strong max-sm:hidden" />
        <LevelBadge level={level} />
        {icon}
        <h1 className="min-w-0 flex-1 text-h2 leading-tight text-balance max-sm:line-clamp-2 sm:truncate">{title}</h1>
      </div>
      {below && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">{below}</div>}
    </header>
  )
}
