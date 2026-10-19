import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from './cx'
import { Halftone } from './Halftone'

/**
 * Interactive dot grid (port of reactbits «Dot Grid», GSAP-era API) on Canvas2D, Caldera tokens.
 *
 *  - Dots within `proximity` of the pointer tint subtly towards `activeColor` (soft falloff, `tint` caps the mix).
 *  - Moving faster than `speedTrigger` px/s kicks the nearby dots; a click / tap sends a shockwave within
 *    `shockRadius`. A kicked dot coasts with linear deceleration `resistance` px/s² (InertiaPlugin semantics),
 *    then springs back critically damped (no bounce) over ≈`returnDuration` s. Kicks have feathered radii. No GSAP.
 *  - `mask` scales dot radii (halftone-like) so the grid fades out of a corner / edge, or draws the logo ramp.
 *  - Draws only on demand: a frame per pointer move near the grid, a rAF loop only while dots move,
 *    nothing at rest. Offscreen (IntersectionObserver) → no frames. `prefers-reduced-motion` → static dots.
 *  - Decorative: aria-hidden, `pointer-events: none`; listens on the nearest `[data-halftone-surface]`
 *    (else the parent), so the card's links / buttons keep working.
 */

export type DotMask = 'none' | 'radial' | 'corner' | 'edge' | 'fade-left' | 'fade-right' | 'fade-top' | 'fade-bottom' | 'ramp'

export interface DotGridProps {
  /** Dot diameter at full mask weight, CSS px. */
  dotSize?: number
  /** Empty space between neighbouring dots, CSS px (lattice cell = dotSize + gap). */
  gap?: number
  /** CSS colour, `--token` or `var(--token)`; re-read on theme change. */
  baseColor?: string
  activeColor?: string
  /** Tint / push radius around the pointer, px. */
  proximity?: number
  /** Pointer speed (px/s) above which nearby dots get pushed. */
  speedTrigger?: number
  shockRadius?: number
  shockStrength?: number
  /** Pointer speed cap, px/s. */
  maxSpeed?: number
  /** Coast deceleration, px/s² (higher = shorter throw). */
  resistance?: number
  /** Spring-back time, s (critically damped, no overshoot). */
  returnDuration?: number
  /** Max share of activeColor mixed in under the pointer (0..1; subtle by default). */
  tint?: number
  mask?: DotMask
  /** Fade start / end of the mask (0..1, preset-specific; ignored by `none` and `ramp`). */
  maskStops?: [number, number]
  /** Lattice angle, degrees (Caldera screen angle ≈ 15–30°). */
  rotate?: number
  interactive?: boolean
  /** `cover` fills the positioned parent absolutely. */
  as?: 'cover' | 'block'
  className?: string
  style?: CSSProperties
  /** Rendered without Canvas2D (default: the static SVG Halftone in the base colour). */
  fallback?: ReactNode
}

const MASK_STOPS: Record<DotMask, [number, number]> = {
  none: [0, 1],
  radial: [0.3, 1],
  corner: [0.2, 0.72],
  edge: [0, 0.45],
  'fade-left': [0, 1],
  'fade-right': [0, 1],
  'fade-top': [0, 1],
  'fade-bottom': [0, 1],
  ramp: [0, 1],
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1)))
  return t * t * (3 - 2 * t)
}

/** Mask weight 0..1 at box coordinates u, v (0..1, origin top-left). */
function maskWeight(mask: DotMask, [a, b]: [number, number], u: number, v: number) {
  switch (mask) {
    case 'radial': // ellipse fading out from the centre
      return 1 - smooth(a, b, Math.hypot(u - 0.5, v - 0.5) / Math.SQRT1_2)
    case 'corner': // = radial-gradient(ellipse at top right, #000 a, transparent b)
      return 1 - smooth(a, b, Math.hypot(1 - u, v) / Math.SQRT2)
    case 'edge': // vignette: fades out on all four edges
      return smooth(a, b, 2 * Math.min(u, 1 - u)) * smooth(a, b, 2 * Math.min(v, 1 - v))
    case 'fade-left': // = linear-gradient(to left, #000, transparent)
      return smooth(a, b, u)
    case 'fade-right':
      return smooth(a, b, 1 - u)
    case 'fade-top':
      return smooth(a, b, v)
    case 'fade-bottom':
      return smooth(a, b, 1 - v)
    case 'ramp': // logo «sun»: dots grow towards the bottom-right, clipped to a disc
      return Math.min(1, Math.max(0, 0.4 + 0.95 * (u + v - 0.58))) * (1 - smooth(0.34, 0.4, Math.hypot(u - 0.5, v - 0.5)))
    default:
      return 1
  }
}

// ——— shared helpers: reduced motion, theme changes, colour resolution ———

const motionQuery = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined
const subscribeMotion = (fn: () => void) => {
  motionQuery?.addEventListener?.('change', fn)
  return () => motionQuery?.removeEventListener?.('change', fn)
}
const getMotion = () => !!motionQuery?.matches

const themeListeners = new Set<() => void>()
let themeObserver: MutationObserver | null = null
/** Calls `fn` when tokens may have changed: `html` class/style/data-theme (theme.ts toggles `.dark`) or OS scheme. */
function onThemeChange(fn: () => void) {
  themeListeners.add(fn)
  if (!themeObserver && typeof MutationObserver !== 'undefined') {
    const notify = () => themeListeners.forEach((l) => l())
    themeObserver = new MutationObserver(notify)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', notify)
  }
  return () => void themeListeners.delete(fn)
}

type Rgba = [number, number, number, number]
let probe: CanvasRenderingContext2D | null | undefined
/** CSS colour / `--token` / `var(--token)` (read on `el`, so scoped overrides apply) → RGBA 0..255 (alpha 0..1). */
function resolveColor(value: string, el: Element): Rgba {
  let css = value.trim()
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(css)
  const token = css.startsWith('--') ? css : m?.[1]
  if (token) css = getComputedStyle(el).getPropertyValue(token).trim() || m?.[2] || 'transparent'
  if (probe === undefined) {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    probe = c.getContext('2d', { willReadFrequently: true })
  }
  if (!probe) return [0, 0, 0, 1]
  // Rasterise one pixel: handles hex, rgb(), oklch(), color-mix() — whatever the browser parses.
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = 'rgba(0,0,0,0)'
  probe.fillStyle = css
  probe.fillRect(0, 0, 1, 1)
  const d = probe.getImageData(0, 0, 1, 1).data
  return [d[0], d[1], d[2], d[3] / 255]
}

const canvas2dAvailable = () => typeof document !== 'undefined' && !!document.createElement('canvas').getContext?.('2d')
const token = (v: string) => (v.startsWith('--') ? `var(${v})` : v)

/** Tint levels between base and active colour (one Path2D fill per level per frame). */
const LEVELS = 8
const ZETA = 1 // critically damped return: no overshoot / bounce
/** Share of the pointer velocity added to a move kick (reactbits: 0.005). */
const SPEED_GAIN = 0.002
/** Feathered edges: a kick fades out over the outer part of its radius (no visible circle). */
const SHOCK_FEATHER = 0.45
const PROX_FEATHER = 0.6

export function DotGrid({
  dotSize = 4,
  gap = 5,
  baseColor = '--brand',
  activeColor = '--terracotta-fill',
  proximity = 80,
  speedTrigger = 150,
  shockRadius = 180,
  shockStrength = 1.7,
  maxSpeed = 3000,
  resistance = 900,
  returnDuration = 1.6,
  tint = 0.45,
  mask = 'none',
  maskStops,
  rotate = 0,
  interactive = true,
  as = 'cover',
  className,
  style,
  fallback,
}: DotGridProps) {
  const [supported] = useState(canvas2dAvailable)
  const reduced = useSyncExternalStore(subscribeMotion, getMotion, () => false)
  const ref = useRef<HTMLCanvasElement>(null)
  const props = useRef({ dotSize, gap, baseColor, activeColor, proximity, speedTrigger, shockRadius, shockStrength, maxSpeed, resistance, returnDuration, tint, mask, maskStops, rotate })
  const api = useRef<{ rebuild(): void; recolor(): void } | null>(null)
  useLayoutEffect(() => {
    props.current = { dotSize, gap, baseColor, activeColor, proximity, speedTrigger, shockRadius, shockStrength, maxSpeed, resistance, returnDuration, tint, mask, maskStops, rotate }
  })

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const live = interactive && !reduced

    // Grid state (struct of arrays). rx/ry rest position, r radius, o* offset, v* velocity, ph 0 rest / 1 coast / 2 return.
    let n = 0
    let rx = new Float32Array(0), ry = rx, rr = rx, ox = rx, oy = rx, vx = rx, vy = rx
    let ph = new Uint8Array(0)
    let W = 0, H = 0, dpr = 1
    let moving = 0
    let colors: string[] = []
    const ptr = { x: -1e5, y: -1e5, t: 0, lx: 0, ly: 0, on: false }
    let tinted = false
    let visible = true
    let raf = 0
    let last = 0

    const rebuild = () => {
      const p = props.current
      const cell = Math.max(1, p.dotSize + p.gap)
      const th = (p.rotate * Math.PI) / 180
      const c = Math.cos(th), s = Math.sin(th)
      const half = Math.ceil((Math.hypot(W, H) / 2 + cell) / cell)
      const stops = p.maskStops ?? MASK_STOPS[p.mask]
      const pad = p.dotSize / 2
      const xs: number[] = [], ys: number[] = [], rs: number[] = []
      for (let j = -half; j <= half; j++) {
        for (let i = -half; i <= half; i++) {
          const x = W / 2 + i * cell * c - j * cell * s
          const y = H / 2 + i * cell * s + j * cell * c
          if (x < -pad || y < -pad || x > W + pad || y > H + pad) continue
          const r = (p.dotSize / 2) * maskWeight(p.mask, stops, W ? x / W : 0, H ? y / H : 0)
          if (r < 0.3) continue
          xs.push(x)
          ys.push(y)
          rs.push(r)
        }
      }
      n = xs.length
      rx = Float32Array.from(xs)
      ry = Float32Array.from(ys)
      rr = Float32Array.from(rs)
      ox = new Float32Array(n)
      oy = new Float32Array(n)
      vx = new Float32Array(n)
      vy = new Float32Array(n)
      ph = new Uint8Array(n)
      moving = 0
    }

    const recolor = () => {
      const p = props.current
      const a = resolveColor(p.baseColor, canvas)
      const b = resolveColor(p.activeColor, canvas)
      colors = Array.from({ length: LEVELS + 1 }, (_, k) => {
        const t = k === 0 ? 0 : (Math.min(1, Math.max(0, p.tint)) * (k - 0.5)) / LEVELS
        const mix = (i: number) => a[i] + (b[i] - a[i]) * t
        return `rgba(${Math.round(mix(0))},${Math.round(mix(1))},${Math.round(mix(2))},${mix(3).toFixed(3)})`
      })
    }

    // ——— physics (replaces gsap.to({ inertia }) + elastic return) ———
    const kick = (i: number, kx: number, ky: number) => {
      if (ph[i] === 1) return // already coasting (reactbits' _inertiaApplied guard)
      vx[i] = kx
      vy[i] = ky
      ph[i] = 1
      moving++
    }
    const step = (dt: number) => {
      const p = props.current
      const w = 6 / Math.max(0.1, p.returnDuration) // critically damped: ~settled after returnDuration
      const k = w * w, d = 2 * ZETA * w
      const sub = Math.max(1, Math.ceil((dt * w) / 0.2))
      const h = dt / sub
      let count = 0
      for (let i = 0; i < n; i++) {
        if (!ph[i]) continue
        if (ph[i] === 1) {
          const sp = Math.hypot(vx[i], vy[i])
          const ns = sp - p.resistance * dt
          if (ns <= 0) {
            vx[i] = vy[i] = 0
            ph[i] = 2
          } else {
            const f = ns / sp
            vx[i] *= f
            vy[i] *= f
            ox[i] += vx[i] * dt
            oy[i] += vy[i] * dt
          }
        } else {
          for (let q = 0; q < sub; q++) {
            vx[i] += (-k * ox[i] - d * vx[i]) * h
            vy[i] += (-k * oy[i] - d * vy[i]) * h
            ox[i] += vx[i] * h
            oy[i] += vy[i] * h
          }
          if (Math.abs(ox[i]) + Math.abs(oy[i]) < 0.06 && Math.abs(vx[i]) + Math.abs(vy[i]) < 1.5) {
            ox[i] = oy[i] = vx[i] = vy[i] = 0
            ph[i] = 0
            continue
          }
        }
        count++
      }
      moving = count
    }

    const draw = () => {
      const prox = props.current.proximity
      const prox2 = prox * prox
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      const paths: (Path2D | null)[] = new Array(LEVELS + 1).fill(null)
      const tint = live && ptr.on
      tinted = false
      for (let i = 0; i < n; i++) {
        let level = 0
        if (tint) {
          const dx = rx[i] - ptr.x, dy = ry[i] - ptr.y
          const d2 = dx * dx + dy * dy
          if (d2 < prox2) {
            const t = 1 - smooth(0, 1, Math.sqrt(d2) / prox) // soft falloff, no ring
            level = t > 0.5 / LEVELS ? 1 + Math.min(LEVELS - 1, Math.floor(t * LEVELS)) : 0
          }
        }
        if (level) tinted = true
        const path = (paths[level] ??= new Path2D())
        const x = rx[i] + ox[i], y = ry[i] + oy[i], r = rr[i]
        path.moveTo(x + r, y)
        path.arc(x, y, r, 0, Math.PI * 2)
      }
      for (let l = 0; l <= LEVELS; l++) {
        const path = paths[l]
        if (!path) continue
        ctx.fillStyle = colors[l]
        ctx.fill(path)
      }
    }

    const tick = (now: number) => {
      raf = 0
      if (!visible) return
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      if (moving) step(dt)
      draw()
      if (moving) raf = requestAnimationFrame(tick)
    }
    const wake = () => {
      if (raf || !visible) return
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }

    const resize = (w: number, h: number) => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      W = Math.max(1, w)
      H = Math.max(1, h)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      rebuild()
      wake()
    }
    const ro = new ResizeObserver(([e]) => {
      const box = e.contentBoxSize?.[0]
      resize(box ? box.inlineSize : e.contentRect.width, box ? box.blockSize : e.contentRect.height)
    })
    ro.observe(canvas)
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting
        if (visible) wake()
        else if (raf) {
          cancelAnimationFrame(raf)
          raf = 0
        }
      },
      { rootMargin: '64px' },
    )
    io.observe(canvas)
    recolor()
    const offTheme = onThemeChange(() => {
      recolor()
      wake()
    })
    api.current = {
      rebuild: () => {
        rebuild()
        wake()
      },
      recolor: () => {
        recolor()
        wake()
      },
    }

    // ——— pointer: listen on the surface (canvas has pointer-events: none) ———
    const target = live ? ((canvas.closest('[data-halftone-surface]') as HTMLElement | null) ?? canvas.parentElement) : null
    const locate = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top] as const
    }
    const near = (x: number, y: number, m: number) => x > -m && y > -m && x < W + m && y < H + m
    const onMove = (e: PointerEvent) => {
      const p = props.current
      const [x, y] = locate(e)
      const now = e.timeStamp || performance.now()
      let pvx = 0, pvy = 0, speed = 0
      if (ptr.t && now - ptr.t < 120) {
        const dt = Math.max(8, now - ptr.t) / 1000
        pvx = (e.clientX - ptr.lx) / dt
        pvy = (e.clientY - ptr.ly) / dt
        speed = Math.hypot(pvx, pvy)
        if (speed > p.maxSpeed) {
          const f = p.maxSpeed / speed
          pvx *= f
          pvy *= f
          speed = p.maxSpeed
        }
      }
      ptr.t = now
      ptr.lx = e.clientX
      ptr.ly = e.clientY
      ptr.x = x
      ptr.y = y
      ptr.on = e.pointerType === 'mouse' || e.buttons > 0 || e.pressure > 0
      const inRange = near(x, y, p.proximity)
      if (inRange && speed > p.speedTrigger) {
        const prox2 = p.proximity * p.proximity
        for (let i = 0; i < n; i++) {
          const dx = rx[i] - x, dy = ry[i] - y
          const d2 = dx * dx + dy * dy
          if (d2 >= prox2) continue
          const f = 1 - smooth(1 - PROX_FEATHER, 1, Math.sqrt(d2) / p.proximity)
          kick(i, (dx + pvx * SPEED_GAIN) * f, (dy + pvy * SPEED_GAIN) * f)
        }
      }
      if (inRange || tinted) wake()
    }
    const onDown = (e: PointerEvent) => {
      const p = props.current
      const [x, y] = locate(e)
      ptr.x = x
      ptr.y = y
      ptr.on = true
      ptr.t = 0
      if (!near(x, y, p.shockRadius)) return
      const s2 = p.shockRadius * p.shockRadius
      for (let i = 0; i < n; i++) {
        const dx = rx[i] - x, dy = ry[i] - y
        const d2 = dx * dx + dy * dy
        if (d2 >= s2) continue
        // Soft profile: rises from the centre, feathered over the outer SHOCK_FEATHER of the radius.
        const u = Math.sqrt(d2) / p.shockRadius
        const f = smooth(0, 0.2, u) * (1 - smooth(1 - SHOCK_FEATHER, 1, u)) * p.shockStrength
        kick(i, dx * f, dy * f)
      }
      wake()
    }
    const onEnd = (e: PointerEvent) => {
      if (e.type !== 'pointerleave' && e.pointerType === 'mouse') return
      ptr.on = false
      ptr.t = 0
      if (tinted) wake()
    }
    const opts = { passive: true }
    if (target) {
      target.addEventListener('pointermove', onMove, opts)
      target.addEventListener('pointerdown', onDown, opts)
      target.addEventListener('pointerup', onEnd, opts)
      target.addEventListener('pointercancel', onEnd, opts)
      target.addEventListener('pointerleave', onEnd, opts)
    }
    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      offTheme()
      api.current = null
      if (target) {
        target.removeEventListener('pointermove', onMove)
        target.removeEventListener('pointerdown', onDown)
        target.removeEventListener('pointerup', onEnd)
        target.removeEventListener('pointercancel', onEnd)
        target.removeEventListener('pointerleave', onEnd)
      }
    }
  }, [supported, reduced, interactive])

  // Geometry / colour prop changes → one rebuild / recolour + a frame.
  const stopsKey = maskStops?.join(',')
  useEffect(() => api.current?.rebuild(), [dotSize, gap, mask, stopsKey, rotate])
  useEffect(() => api.current?.recolor(), [baseColor, activeColor, tint])

  const pos = as === 'cover' ? 'absolute inset-0 size-full' : 'block size-full'
  if (!supported) {
    if (fallback !== undefined) return <>{fallback}</>
    return <Halftone step={dotSize + gap} dot={token(baseColor)} bg="none" className={cx(pos, 'pointer-events-none', className)} />
  }
  return <canvas ref={ref} aria-hidden className={cx(pos, 'pointer-events-none', className)} style={style} />
}

type SurfaceTag = 'div' | 'section' | 'article' | 'aside' | 'header' | 'li'

/**
 * Wraps a card / hero: the dot grid is a background layer (`-z-10` inside an `isolate` box), content stays
 * above, and the wrapper is the pointer surface. Pass DotGrid props via `dots`.
 */
export function HalftoneSurface({
  as: Tag = 'div',
  dots,
  layerClassName,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & {
  as?: SurfaceTag
  dots?: Omit<DotGridProps, 'as'>
  /** Classes for the layer box (position / size / opacity); default fills the surface. */
  layerClassName?: string
}) {
  return (
    <Tag data-halftone-surface="" className={cx('relative isolate', className)} {...rest}>
      <span aria-hidden className={cx('pointer-events-none absolute -z-10', layerClassName ?? 'inset-0')}>
        <DotGrid {...dots} />
      </span>
      {children}
    </Tag>
  )
}
