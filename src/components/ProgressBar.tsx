import { cx } from './cx'

/** Horizontal progress bar; `value` in 0..1. `segments` renders stacked parts (e.g. topic statuses). */
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
  segments?: { value: number; className: string; title?: string }[]
  className?: string
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  const h = size === 'sm' ? 'h-2' : size === 'lg' ? 'h-4' : 'h-2.5'
  const fill = { brand: 'bg-brand', azulejo: 'bg-azulejo', sun: 'bg-sun-fill', terracotta: 'bg-terracotta-fill' }[tone]
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cx('flex gap-0.5 overflow-hidden rounded-pill bg-sunken', h, className)}
    >
      {segments ? (
        segments.map((s, i) =>
          s.value > 0 ? (
            <div
              key={i}
              title={s.title}
              className={cx('h-full rounded-pill transition-[width] duration-500 ease-out', s.className)}
              style={{ width: `${Math.min(1, s.value) * 100}%` }}
            />
          ) : null,
        )
      ) : (
        <div className={cx('h-full rounded-full transition-[width] duration-500 ease-out', fill)} style={{ width: `${pct}%` }} />
      )}
    </div>
  )
}
