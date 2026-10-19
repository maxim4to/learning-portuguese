import { useMemo } from 'react'
import { cx } from './cx'

/**
 * Caldera's signature motif: a halftone dot screen (Ember dots of varying size on Plasma violet).
 * Deterministic «noise» from a few sine waves (same seed → same picture), rendered as ONE <path>
 * so a hero-sized screen costs a single DOM node. Purely decorative (aria-hidden).
 * Colours come from tokens, so both themes follow automatically.
 */
export function Halftone({
  seed = 1,
  width = 480,
  height = 300,
  step = 10,
  bg = 'var(--terracotta-fill)',
  dot = 'var(--brand)',
  /** 0..1 bias towards solid dots (higher = more Ember). */
  heat = 0.5,
  /** Fade the screen towards one edge (for corners over a card). */
  fade,
  className,
}: {
  seed?: number
  width?: number
  height?: number
  step?: number
  bg?: string
  dot?: string
  heat?: number
  fade?: 'left' | 'right' | 'top' | 'bottom'
  className?: string
}) {
  const d = useMemo(() => halftonePath(seed, width, height, step, heat, fade), [seed, width, height, step, heat, fade])
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className={cx('block', className)}
    >
      {bg !== 'none' && <rect width={width} height={height} fill={bg} />}
      <path d={d} fill={dot} />
    </svg>
  )
}

function halftonePath(seed: number, w: number, h: number, step: number, heat: number, fade?: string) {
  const s = seed * 1.618
  const maxR = step * 0.64
  let d = ''
  for (let y = step / 2; y < h + step; y += step) {
    for (let x = step / 2; x < w + step; x += step) {
      const u = x / w
      const v = y / h
      let n =
        0.5 +
        0.28 * Math.sin(u * 5.1 + s) * Math.cos(v * 4.3 - s * 0.7) +
        0.18 * Math.sin((u + v) * 7.7 + s * 1.9) +
        0.12 * Math.cos(u * 11.3 - v * 9.1 + s * 3.1)
      n += heat - 0.5
      if (fade === 'left') n *= u
      else if (fade === 'right') n *= 1 - u
      else if (fade === 'top') n *= v
      else if (fade === 'bottom') n *= 1 - v
      const r = maxR * Math.min(1, Math.max(0, n)) ** 1.15
      if (r < 0.45) continue
      const cy = y.toFixed(1)
      const rr = r.toFixed(2)
      d += `M${(x - r).toFixed(2)} ${cy}a${rr} ${rr} 0 1 0 ${(2 * r).toFixed(2)} 0a${rr} ${rr} 0 1 0 ${(-2 * r).toFixed(2)} 0`
    }
  }
  return d
}
