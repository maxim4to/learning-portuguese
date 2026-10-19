import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  accent: 'btn-accent',
}
// Every size keeps a ≥44px touch target (sm is visually lighter, not shorter).
const SIZE: Record<ButtonSize, string> = {
  sm: 'px-4 text-sm',
  md: '',
  lg: 'min-h-14 px-7 text-lg',
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
