import { useEffect, useState, type ReactNode } from 'react'
import { cx } from './cx'
import type { RingTone } from './tones'

const STROKE: Record<RingTone, string> = {
  brand: 'stroke-brand',
  sun: 'stroke-sun-fill',
  terracotta: 'stroke-terracotta-fill',
  azulejo: 'stroke-azulejo',
}

/**
 * Circular progress (SVG). Animates from 0 on mount (disabled by reduced-motion via the global rule).
 * Decorative by default — pass `label` to expose it as a progressbar.
 */
export function ProgressRing({
  value,
  size = 120,
  stroke = 10,
  tone = 'brand',
  label,
  children,
  className,
}: {
  /** 0..1 */
  value: number
  size?: number
  stroke?: number
  tone?: RingTone
  label?: string
  children?: ReactNode
  className?: string
}) {
  const v = Math.min(1, Math.max(0, value))
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(v))
    return () => cancelAnimationFrame(id)
  }, [v])
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div
      className={cx('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
      {...(label
        ? { role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(v * 100) }
        : { 'aria-hidden': !children })}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-sunken" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          className={cx('transition-[stroke-dashoffset] duration-700 ease-out', STROKE[tone])}
          style={{ opacity: v === 0 ? 0 : 1 }}
        />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  )
}
