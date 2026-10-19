import type { HTMLAttributes } from 'react'
import { cx } from './cx'

export type CardTone = 'default' | 'raised' | 'sunken' | 'accent' | 'hero'

const CARD_TONE: Record<CardTone, string> = {
  default: 'card',
  raised: 'card-raised',
  sunken: 'card-sunken',
  accent: 'card border-brand/30 bg-brand-soft',
  hero: 'card-raised relative isolate overflow-hidden rounded-hero p-5 sm:p-7',
}

/** Faint azulejo ornament for hero surfaces (place inside a `relative overflow-hidden` box). */
export function AzulejoCorner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'azulejo-pattern pointer-events-none absolute -top-8 -right-8 -z-10 size-64 opacity-[0.08] [mask-image:radial-gradient(circle_at_top_right,#000_25%,transparent_70%)] dark:opacity-[0.14]',
        className,
      )}
    />
  )
}

type Props = HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'article' | 'li' | 'aside'; tone?: CardTone }

/** Surface container: default / raised (hero, dialogs) / sunken (nested) / accent / hero (with ornament). */
export function Card({ as: Tag = 'div', tone = 'default', className, children, ...rest }: Props) {
  return (
    <Tag className={cx(CARD_TONE[tone], className)} {...rest}>
      {tone === 'hero' && <AzulejoCorner />}
      {children}
    </Tag>
  )
}
