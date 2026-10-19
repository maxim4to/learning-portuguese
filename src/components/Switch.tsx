import { useId, type ReactNode } from 'react'
import { cx } from './cx'

/** Accessible toggle (role="switch"), 44×26 track, label + optional description wired by id. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  className,
}: {
  checked: boolean
  onChange(v: boolean): void
  label: ReactNode
  description?: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={cx('flex items-start justify-between gap-4', className)}>
      {/* Description sits outside the <label>: it is the switch's description, not part of its name. */}
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer font-semibold">
          {label}
        </label>
        {description && (
          <span id={`${id}-d`} className="block text-sm text-ink-muted">
            {description}
          </span>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-d` : undefined}
        onClick={() => onChange(!checked)}
        className={cx(
          'hit relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-pill border-[1.5px] transition-colors duration-200',
          checked ? 'border-brand bg-brand' : 'border-line-strong bg-surface-2',
        )}
      >
        <span
          aria-hidden
          className={cx(
            'inline-block size-5 rounded-full transition-transform duration-200 ease-out',
            checked ? 'translate-x-[22.5px] bg-on-brand' : 'translate-x-[2.5px] bg-ink-subtle',
          )}
        />
      </button>
    </div>
  )
}
