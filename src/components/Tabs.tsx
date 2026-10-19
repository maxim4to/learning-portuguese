import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from './cx'
import { subItemClass, subMetaClass, subRowOuter, subRowScroller, useActiveInView } from './subNavStyle'
import { useScrollEdges } from './useScrollEdges'

export interface TabItem<T extends string> {
  value: T
  label: ReactNode
  /** Small counter / status after the label (e.g. «14», «✓»). */
  meta?: ReactNode
}

const tabId = (idBase: string, value: string) => `${idBase}-tab-${value}`
const panelId = (idBase: string, value: string) => `${idBase}-panel-${value}`

/**
 * WAI-ARIA tabs: roving tabindex, ←/→/Home/End (automatic activation), ids wired to panels,
 * active tab kept in view in the horizontally scrolling bar, edges faded only where tabs are hidden.
 * Looks like `SubNav` (the shared second-level style); use SubNav instead when each item is its own route.
 * `sticky` pins the bar under the status bar (mobile) / top bar (desktop) via --sticky-top.
 * Render panels with <TabPanel idBase value active>.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  idBase,
  label,
  sticky,
  className,
}: {
  items: readonly TabItem<T>[]
  value: T
  onChange(v: T): void
  idBase: string
  label: string
  sticky?: boolean
  className?: string
}) {
  const barRef = useRef<HTMLDivElement>(null)
  useScrollEdges(barRef)

  useActiveInView(barRef, '[aria-selected="true"]', value)

  function onKey(e: KeyboardEvent) {
    const i = items.findIndex((t) => t.value === value)
    let n = -1
    if (e.key === 'ArrowRight') n = (i + 1) % items.length
    else if (e.key === 'ArrowLeft') n = (i - 1 + items.length) % items.length
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = items.length - 1
    if (n < 0) return
    e.preventDefault()
    onChange(items[n].value)
    document.getElementById(tabId(idBase, items[n].value))?.focus()
  }

  return (
    // Same second-level style as SubNav: text tabs with an ink underline on a 1px baseline, one row that scrolls on phones.
    <div className={cx(subRowOuter, '-mx-4', sticky ? 'sticky top-(--sticky-top) z-10 bg-bg md:-mx-2 md:px-2 md:before:inset-x-2' : 'md:mx-0', className)}>
      <div ref={barRef} role="tablist" aria-label={label} onKeyDown={onKey} className={cx(subRowScroller, 'px-4 md:px-0')}>
        {items.map((t) => {
          const on = t.value === value
          return (
            <button
              key={t.value}
              id={tabId(idBase, t.value)}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls={panelId(idBase, t.value)}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(t.value)}
              className={subItemClass(on)}
            >
              {t.label}
              {t.meta !== undefined && <span className={subMetaClass}>{t.meta}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TabPanel({
  idBase,
  value,
  active,
  className,
  children,
}: {
  idBase: string
  value: string
  active: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <section
      id={panelId(idBase, value)}
      role="tabpanel"
      aria-labelledby={tabId(idBase, value)}
      hidden={!active}
      tabIndex={-1}
      className={cx('outline-none', className)}
    >
      {children}
    </section>
  )
}
