import type { HTMLAttributes } from 'react'
import { cx } from './cx'
import { DotGrid, type DotGridProps } from './DotGrid'

export type CardTone = 'default' | 'raised' | 'sunken' | 'accent' | 'hero'

const CARD_TONE: Record<CardTone, string> = {
  default: 'card',
  raised: 'card-raised',
  sunken: 'card-sunken',
  accent: 'card bg-brand-soft',
  hero: 'card-raised relative isolate overflow-hidden',
}

/**
 * Interactive dot-grid ornament (see DotGrid) fading out of the top-right corner of a `relative isolate
 * overflow-hidden` box. The box should carry `data-halftone-surface` so the dots react to the pointer anywhere
 * on it (tint near the pointer, push on fast moves, shockwave on click / tap). `size="sm"` = a small, quiet card
 * corner. Use only on text surfaces: where an illustration is present, the illustration's own halftone wins.
 * Name kept from the previous azulejo ornament.
 */
export function AzulejoCorner({
  className,
  size = 'lg',
  opacity = size === 'sm' ? 0.6 : 0.9,
  dots,
}: {
  className?: string
  size?: 'lg' | 'sm'
  /** Layer opacity (keeps text over the dots readable). */
  opacity?: number
  /** DotGrid overrides. */
  dots?: Omit<DotGridProps, 'as'>
}) {
  return (
    <span
      aria-hidden
      className={cx(
        'pointer-events-none absolute -z-10',
        size === 'sm' ? 'top-0 right-0 h-24 w-40' : '-top-2 -right-2 h-44 w-72 sm:h-56 sm:w-96',
        className,
      )}
      style={{ opacity }}
    >
      <DotGrid
        mask="corner"
        {...(size === 'sm'
          ? { dotSize: 3.5, gap: 3.5, maskStops: [0.08, 0.7] as [number, number], proximity: 60, shockRadius: 130 }
          : { dotSize: 5, gap: 4, rotate: 18, proximity: 90, shockRadius: 200 })}
        {...dots}
      />
    </span>
  )
}

type Props = HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'article' | 'li' | 'aside'; tone?: CardTone }

/** Flat surface container: default / raised / sunken (nested) / accent (Ember wash) / hero (40px radius + halftone). */
export function Card({ as: Tag = 'div', tone = 'default', className, children, ...rest }: Props) {
  return (
    <Tag data-halftone-surface={tone === 'hero' ? '' : undefined} className={cx(CARD_TONE[tone], className)} {...rest}>
      {tone === 'hero' && <AzulejoCorner />}
      {children}
    </Tag>
  )
}
