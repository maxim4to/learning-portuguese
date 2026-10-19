import { cx } from './cx'

type Segment = { value: number; className: string; title?: string }

/**
 * Horizontal progress bar; `value` in 0..1. `segments` renders a stacked bar (e.g. topic statuses):
 * one rounded track, segments laid flush inside it with straight internal edges — only the track's outer
 * ends are rounded (overflow clips the first/last segment). A non-empty segment never drops below 4px.
 */
export function ProgressBar({
  value = 0,
  label,
  size = 'md',
  tone = 'brand',
  segments,
  className = '',
}: {
  value?: number
  label?: string
  size?: 'sm' | 'md' | 'lg'
  tone?: 'brand' | 'azulejo' | 'sun' | 'terracotta'
  segments?: Segment[]
  className?: string
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  const h = size === 'sm' ? 'h-2' : size === 'lg' ? 'h-4' : 'h-2.5'
  const track = cx('flex overflow-hidden rounded-pill bg-sunken', h, className)

  if (segments) {
    const shown = segments.filter((s) => s.value > 0)
    const parts = segments.map((s) => s.title).filter(Boolean)
    const aria = [label, parts.join(', ')].filter(Boolean).join('. ')
    return (
      <div role="img" aria-label={aria || undefined} className={track}>
        {shown.map((s, i) => (
          <div
            key={i}
            title={s.title}
            className={cx('h-full shrink transition-[flex-basis] duration-500 ease-out', s.className)}
            style={{ flexBasis: `${Math.min(1, s.value) * 100}%`, minWidth: 4 }}
          />
        ))}
      </div>
    )
  }

  const fill = { brand: 'bg-brand', azulejo: 'bg-azulejo', sun: 'bg-sun-fill', terracotta: 'bg-terracotta-fill' }[tone]
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label} className={track}>
      <div className={cx('h-full rounded-pill transition-[width] duration-500 ease-out', fill)} style={{ width: `${pct}%` }} />
    </div>
  )
}
