import type { HTMLAttributes } from 'react'
import { cx } from './cx'
import { Halftone } from './Halftone'

export type CardTone = 'default' | 'raised' | 'sunken' | 'accent' | 'hero'

const CARD_TONE: Record<CardTone, string> = {
  default: 'card',
  raised: 'card-raised',
  sunken: 'card-sunken',
  accent: 'card bg-brand-soft',
  hero: 'card-raised relative isolate overflow-hidden rounded-hero p-6 sm:p-10',
}

/**
 * Halftone ornament for hero surfaces (place inside a `relative overflow-hidden` box): an Ember dot screen
 * fading out of the top-right corner. Name kept from the previous azulejo ornament.
 */
export function AzulejoCorner({ className, seed = 3 }: { className?: string; seed?: number }) {
  return (
    <span
      aria-hidden
      className={cx(
        'pointer-events-none absolute -top-2 -right-2 -z-10 h-44 w-72 opacity-90 [mask-image:radial-gradient(ellipse_at_top_right,#000_20%,transparent_72%)] sm:h-56 sm:w-96',
        className,
      )}
    >
      <Halftone seed={seed} width={384} height={224} step={9} bg="none" heat={0.62} className="size-full" />
    </span>
  )
}

type Props = HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'article' | 'li' | 'aside'; tone?: CardTone }

/** Flat surface container: default / raised / sunken (nested) / accent (Ember wash) / hero (40px radius + halftone). */
export function Card({ as: Tag = 'div', tone = 'default', className, children, ...rest }: Props) {
  return (
    <Tag className={cx(CARD_TONE[tone], className)} {...rest}>
      {tone === 'hero' && <AzulejoCorner />}
      {children}
    </Tag>
  )
}
