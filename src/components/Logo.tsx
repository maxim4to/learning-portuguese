import { cx } from './cx'
import { DotGrid } from './DotGrid'

/**
 * Brand mark: an Ember disc with a halftone «sun» of obsidian dots (Caldera motif).
 * Live version: the same 3×3 ramp drawn by DotGrid (`mask="ramp"`): dots tint and flick on the pointer over the
 * nearest `[data-halftone-surface]`, e.g. the header home link. Static at rest / with reduced motion.
 * The name `AzulejoMark` is kept for existing imports. `size` is the rendered size in CSS px.
 */
export function AzulejoMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <span aria-hidden className={cx('relative block shrink-0 overflow-hidden rounded-full bg-brand', className)} style={{ width: size, height: size }}>
      <DotGrid
        mask="ramp"
        baseColor="--on-brand"
        activeColor="--surface"
        dotSize={(size * 5) / 24}
        gap={0}
        proximity={size}
        shockRadius={size * 1.5}
        fallback={<StaticMark />}
      />
    </span>
  )
}

function StaticMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="absolute inset-0 size-full">
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
