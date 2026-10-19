import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from './cx'

/**
 * Single-choice segmented control (radiogroup with roving tabindex and arrow keys).
 * Each segment is ≥44px tall.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
  className,
}: {
  value: T
  options: readonly { value: T; label: ReactNode; ariaLabel?: string }[]
  onChange(v: T): void
  label: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  function onKey(e: KeyboardEvent) {
    const i = options.findIndex((o) => o.value === value)
    let n = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % options.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + options.length) % options.length
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = options.length - 1
    if (n < 0) return
    e.preventDefault()
    onChange(options[n].value)
    ref.current?.querySelectorAll<HTMLElement>('[role="radio"]')[n]?.focus()
  }

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKey}
      className={cx('inline-flex gap-1 rounded-pill bg-surface-2 p-1', className)}
    >
      {options.map((o, i) => {
        const on = o.value === value
        const focusable = on || (i === 0 && !options.some((x) => x.value === value))
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.ariaLabel}
            tabIndex={focusable ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-pill px-3 font-semibold sm:px-4 whitespace-nowrap transition-[background-color,color,box-shadow] duration-150',
              size === 'sm' ? 'min-h-9 text-sm hit' : 'min-h-11 text-sm',
              on ? 'bg-ink text-surface' : 'text-ink-muted hover:bg-surface hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
