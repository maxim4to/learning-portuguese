import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
/** md (44px, 16px label) = page and step actions; sm (36px visual, 44px hit, 14px label) = inline / row actions. */
export type ButtonSize = 'sm' | 'md'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  accent: 'btn-accent',
}
// Sizes live in index.css (btn / btn-sm) so raw `className="btn-primary btn-sm"` and <Button size="sm"> match.
// Every size keeps a ≥44px touch target.
const SIZE: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: '',
}

function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cx(VARIANT[variant], SIZE[size], className)
}

interface Common {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Leading icon (decorative). */
  icon?: ReactNode
  /** Trailing icon (decorative). */
  iconEnd?: ReactNode
  block?: boolean
}

export type ButtonProps = Common & ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }

export function Button({ variant, size, icon, iconEnd, block, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, cx(block && 'w-full', className))} {...rest}>
      {icon && <span aria-hidden className="-ml-0.5 inline-flex shrink-0">{icon}</span>}
      {children}
      {iconEnd && <span aria-hidden className="-mr-0.5 inline-flex shrink-0">{iconEnd}</span>}
    </button>
  )
}

export function ButtonLink({ variant, size, icon, iconEnd, block, className, children, ...rest }: Common & LinkProps) {
  return (
    <Link className={buttonClass(variant, size, cx(block && 'w-full', className))} {...rest}>
      {icon && <span aria-hidden className="-ml-0.5 inline-flex shrink-0">{icon}</span>}
      {children}
      {iconEnd && <span aria-hidden className="-mr-0.5 inline-flex shrink-0">{iconEnd}</span>}
    </Link>
  )
}
