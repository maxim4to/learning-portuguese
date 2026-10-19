import { cx } from './cx'

/**
 * Brand mark: an Ember disc with a halftone «sun» of obsidian dots (Caldera motif).
 * The name `AzulejoMark` is kept for existing imports.
 */
export function AzulejoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cx('shrink-0', className)}>
      <rect width="24" height="24" rx="12" className="fill-brand" />
      <g className="fill-on-brand">
        <circle cx="7" cy="7" r="1" />
        <circle cx="12" cy="7" r="1.5" />
        <circle cx="17" cy="7" r="2" />
        <circle cx="7" cy="12" r="1.5" />
        <circle cx="12" cy="12" r="2.1" />
        <circle cx="17" cy="12" r="2.5" />
        <circle cx="7" cy="17" r="2" />
        <circle cx="12" cy="17" r="2.5" />
        <circle cx="17" cy="17" r="2.5" />
      </g>
    </svg>
  )
}
