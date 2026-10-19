import type { ReactNode } from 'react'
import { RotateCw, TriangleAlert } from 'lucide-react'
import { cx } from './cx'
import { Illustration } from './Illustration'
import type { IllustrationName } from './illustrations'

/** Icon + one line of meaning + optional CTA. */
export function EmptyState({
  icon,
  art,
  title,
  text,
  action,
  tone = 'brand',
  className,
  compact,
}: {
  icon?: ReactNode
  /** Poster illustration instead of the icon circle (decorative). */
  art?: IllustrationName
  title: ReactNode
  text?: ReactNode
  action?: ReactNode
  tone?: 'brand' | 'azulejo' | 'terracotta' | 'sun' | 'neutral'
  className?: string
  compact?: boolean
}) {
  const iconTone = {
    brand: 'bg-brand-soft text-brand-ink',
    azulejo: 'bg-azulejo-soft text-azulejo-ink',
    terracotta: 'bg-terracotta-soft text-terracotta',
    sun: 'bg-sun-soft text-sun',
    neutral: 'bg-azulejo-soft text-ink',
  }[tone]
  return (
    <div className={cx('flex flex-col items-center text-center', compact ? 'gap-2 py-4' : 'gap-3 py-8', className)}>
      {art ? (
        <Illustration name={art} sizes={compact ? '144px' : '208px'} className={cx('rounded-card', compact ? 'w-36' : 'w-52')} />
      ) : icon && (
        <span aria-hidden className={cx('grid place-items-center rounded-full', compact ? 'size-12' : 'size-16', iconTone)}>
          {icon}
        </span>
      )}
      <p className={cx('text-ink', compact ? 'text-base font-semibold' : 'font-display text-h2')}>{title}</p>
      {text && <p className="max-w-[44ch] text-sm text-ink-muted">{text}</p>}
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

/** Human error with a retry button. */
export function ErrorState({ text, detail, onRetry }: { text?: string; detail?: string; onRetry?(): void }) {
  return (
    <div role="alert" className="card flex flex-col items-center gap-3 py-8 text-center">
      <span aria-hidden className="grid size-16 place-items-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert className="size-6" />
      </span>
      <p className="font-display text-h2">{text ?? 'Не удалось загрузить данные'}</p>
      {detail && <p className="max-w-[48ch] text-sm break-words text-ink-muted">{detail}</p>}
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          <RotateCw aria-hidden className="size-4" /> Повторить
        </button>
      )}
    </div>
  )
}

/** Placeholder block while loading (pulse is disabled under reduced motion). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('animate-pulse rounded-card bg-surface-2', className)} />
}

/** Page-level loading placeholder: a heading bar and a few cards. */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-5" role="status" aria-label="Загрузка">
      <Skeleton className="h-12 w-56 rounded-pill" />
      {Array.from({ length: cards }, (_, i) => (
        <Skeleton key={i} className={i === 0 ? 'h-40' : 'h-24'} />
      ))}
      <span className="sr-only">Загрузка…</span>
    </div>
  )
}
