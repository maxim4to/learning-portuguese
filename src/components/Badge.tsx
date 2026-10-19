import type { ReactNode } from 'react'
import { cx } from './cx'
import { BADGE_TONE, type BadgeTone } from './tones'

export type { BadgeTone }

export function Badge({
  tone = 'neutral',
  size = 'sm',
  icon,
  className,
  title,
  children,
}: {
  tone?: BadgeTone
  size?: 'sm' | 'md'
  icon?: ReactNode
  className?: string
  title?: string
  children: ReactNode
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full font-semibold whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        BADGE_TONE[tone],
        className,
      )}
    >
      {icon && (
        <span aria-hidden className="inline-flex">
          {icon}
        </span>
      )}
      {children}
    </span>
  )
}
