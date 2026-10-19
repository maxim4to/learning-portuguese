import { cx } from './cx'

/** Brand mark: a small azulejo tile. */
export function AzulejoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cx('shrink-0', className)}>
      <rect width="24" height="24" rx="6" className="fill-azulejo" />
      <g fill="none" className="stroke-surface" strokeWidth="1.4" strokeLinecap="round">
        <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" />
        <circle cx="12" cy="12" r="3" />
      </g>
      <g className="fill-surface">
        <circle cx="3.5" cy="3.5" r="1.6" />
        <circle cx="20.5" cy="3.5" r="1.6" />
        <circle cx="3.5" cy="20.5" r="1.6" />
        <circle cx="20.5" cy="20.5" r="1.6" />
      </g>
    </svg>
  )
}
