import { cx } from './cx'

/**
 * Brand mark: the front of a Lisbon «eléctrico» (tram 28) — rounded roof, trolley pole, three split front windows,
 * headlamp. Flat Caldera colours from tokens: body = brand, windows = on-brand, pole/truck = ink (flips with the
 * theme), lamp = light in both themes. At ≤ 24 px a simplified 16-unit glyph is drawn (fewer, pixel-snapped parts).
 * Hover (on the enclosing link): the tram lifts 1 px, transform-only; off under reduced motion.
 * The name `AzulejoMark` is kept for existing imports. `size` is the rendered size in CSS px.
 * Static copies (favicon, PWA icons) live in public/ with --brand baked in.
 */
export function AzulejoMark({ className, size = 32 }: { className?: string; size?: number }) {
  const small = size <= 24
  return (
    <svg
      viewBox={small ? '0 0 16 16' : '0 0 48 48'}
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={cx(
        'block shrink-0 transition-transform duration-200 ease-out in-[a:hover]:-translate-y-px motion-reduce:transition-none motion-reduce:in-[a:hover]:translate-y-0',
        className,
      )}
    >
      {small ? <SmallTram /> : <FullTram />}
    </svg>
  )
}

function FullTram() {
  return (
    <>
      <g className="fill-none stroke-ink" strokeLinecap="round" strokeWidth={2.6}>
        <path d="M26 5 22 11" />
        <path d="M15 41 12.6 45.4M33 41 35.4 45.4" strokeWidth={2.8} />
      </g>
      <g className="fill-ink">
        <rect x="18.5" y="2.8" width="12" height="3" rx="1.5" />
        <rect x="15" y="10" width="18" height="3" rx="1.2" />
        <path d="M8 38.4h32v.6a2.6 2.6 0 0 1-2.6 2.6H10.6A2.6 2.6 0 0 1 8 39z" />
      </g>
      <g className="fill-brand">
        <path d="M9 18.2C9 14.6 14.6 12.6 24 12.6S39 14.6 39 18.2z" />
        <rect x="9" y="19.8" width="30" height="17.4" rx="2" />
      </g>
      <g className="fill-on-brand">
        <path d="M12 23.4Q15.5 21.6 19 23.4V30H12z" />
        <path d="M20.5 23.4Q24 21.6 27.5 23.4V30h-7z" />
        <path d="M29 23.4Q32.5 21.6 36 23.4V30h-7z" />
        <circle cx="24" cy="33.6" r="2.4" />
      </g>
      <circle cx="24" cy="33.6" r="1" className="fill-surface dark:fill-ink" />
    </>
  )
}

function SmallTram() {
  return (
    <>
      <path d="M8.9 1.9 7.4 4" className="fill-none stroke-ink" strokeLinecap="round" strokeWidth={1.2} />
      <g className="fill-ink">
        <rect x="5.5" y="0.6" width="5" height="1.3" rx=".65" />
        <path d="M2 12.6h12v.4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
        <path d="M4 14h1.4l-.6 1.6H3.4zM10.6 14H12l.6 1.6h-1.4z" />
      </g>
      <path className="fill-brand" d="M2.5 6.2C2.5 4.7 4.8 3.8 8 3.8s5.5.9 5.5 2.4V12a.6.6 0 0 1-.6.6H3.1a.6.6 0 0 1-.6-.6z" />
      <g className="fill-on-brand">
        <rect x="3.8" y="6.2" width="2.4" height="2.7" rx=".4" />
        <rect x="6.8" y="6.2" width="2.4" height="2.7" rx=".4" />
        <rect x="9.8" y="6.2" width="2.4" height="2.7" rx=".4" />
        <circle cx="8" cy="10.9" r=".9" />
      </g>
    </>
  )
}
