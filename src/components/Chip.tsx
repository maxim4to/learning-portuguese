import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

/** Toggle chip (filters): `aria-pressed`, 36px visual height with a 44px hit area. */
export function Chip({
  pressed,
  count,
  muted,
  className,
  children,
  ...rest
}: { pressed: boolean; count?: number; muted?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cx(
        'hit inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]',
        pressed
          ? 'border-transparent bg-ink text-bg shadow-card'
          : 'border-line-strong bg-surface text-ink hover:border-ink-subtle hover:bg-surface-2',
        muted && !pressed && 'text-ink-muted',
        className,
      )}
      {...rest}
    >
      {children}
      {count !== undefined && (
        <span className={cx('tabular-nums', pressed ? 'opacity-80' : 'text-ink-muted')}>{count}</span>
      )}
    </button>
  )
}

/** Labelled group of toggle chips (not a tablist: there are no panels). */
export function ChipGroup({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={cx('flex flex-wrap gap-2', className)}>
      {children}
    </div>
  )
}
