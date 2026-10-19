import { useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from './cx'
import { subItemClass, subMetaClass, subRowOuter, subRowScroller, useActiveInView } from './subNavStyle'
import { useScrollEdges } from './useScrollEdges'


export interface SubNavItem<T extends string> {
  value: T
  to: string
  label: ReactNode
  /** Small counter after the label (hidden on phones to keep the row short). */
  meta?: ReactNode
}

/**
 * Route-based sub-sections: a `nav` of links, the current one marked `aria-current="page"` (not ARIA tabs —
 * each item is its own URL). The row bleeds to the screen edges on phones so it can scroll edge to edge.
 */
export function SubNav<T extends string>({
  items,
  active,
  label,
  className,
}: {
  items: readonly SubNavItem<T>[]
  active: T
  label: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useScrollEdges(ref)
  useActiveInView(ref, '[aria-current="page"]', active)
  return (
    <nav aria-label={label} className={cx(subRowOuter, '-mx-4 md:mx-0 print:hidden', className)}>
      <div ref={ref} className={cx(subRowScroller, 'px-4 md:px-0')}>
        {items.map((t) => {
          const on = t.value === active
          return (
            <Link key={t.value} to={t.to} aria-current={on ? 'page' : undefined} className={subItemClass(on)}>
              {t.label}
              {t.meta !== undefined && <span className={cx(subMetaClass, 'max-sm:hidden')}>{t.meta}</span>}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
