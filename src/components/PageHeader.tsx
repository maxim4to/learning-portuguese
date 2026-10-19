import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { cx } from './cx'

/** «← Раздел» link with a 44px target. */
export function BackLink({ to, label, className }: { to: string; label: string; className?: string }) {
  return (
    <Link
      to={to}
      className={cx(
        '-ml-1 inline-flex min-h-11 items-center gap-1 rounded-pill pr-4 pl-2.5 text-sm font-semibold text-ink no-underline transition-colors hover:bg-surface print:hidden',
        className,
      )}
    >
      <ChevronLeft aria-hidden className="size-4.5" strokeWidth={2.25} />
      {label}
    </Link>
  )
}

/**
 * Unified page start: optional back link, display h1, a plain meta line (badges, last result), subtitle, actions on the right.
 * Sets the same rhythm on every screen (audit §2.5, §2.10, §3.10).
 */
export function PageHeader({
  back,
  meta,
  title,
  titleLang,
  subtitle,
  actions,
  children,
  className,
}: {
  back?: { to: string; label: string }
  /** Short sentence-case line under the title (level / status badges, last result). No uppercase kicker. */
  meta?: ReactNode
  title: ReactNode
  titleLang?: string
  subtitle?: ReactNode
  actions?: ReactNode
  /** Extra content under the title block (filters, meta rows). */
  children?: ReactNode
  className?: string
}) {
  return (
    <header className={cx('space-y-4', className)}>
      {back && <BackLink {...back} />}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 space-y-2">
          <h1 lang={titleLang} className="text-balance">
            {title}
          </h1>
          {meta && <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">{meta}</div>}
          {subtitle && <div className="max-w-[60ch] text-ink-muted md:text-lg">{subtitle}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  )
}
