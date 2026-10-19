import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cx, scrollBehavior } from './cx'

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
 * active tab kept in view in the horizontally scrolling bar, faded edges.
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

  useEffect(() => {
    const bar = barRef.current
    const el = bar?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!bar || !el) return
    const l = el.offsetLeft - bar.offsetLeft
    if (l < bar.scrollLeft + 8 || l + el.offsetWidth > bar.scrollLeft + bar.clientWidth - 8)
      bar.scrollTo({ left: l - 24, behavior: scrollBehavior() })
  }, [value])

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
    <div className={cx(sticky && 'sticky top-(--sticky-top) z-10 -mx-4 bg-bg px-4 py-2 md:-mx-2 md:px-2', className)}>
      <div
        ref={barRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKey}
        // Phones: the tabs wrap onto a second row (nothing hidden behind a fade); from md one pill that hugs its tabs.
        className="flex flex-wrap gap-1 rounded-[1.375rem] bg-surface p-1 md:scroll-fade-x md:w-fit md:max-w-full md:flex-nowrap md:overflow-x-auto md:rounded-pill"
      >
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
              className={cx(
                'inline-flex min-h-11 flex-auto items-center justify-center gap-1.5 rounded-pill px-4 active:scale-[0.97] motion-reduce:active:scale-100 md:flex-none md:shrink-0 text-sm font-semibold whitespace-nowrap transition-[background-color,color,transform] duration-150 lg:px-5',
                on ? 'bg-ink text-surface' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
              )}
            >
              {t.label}
              {t.meta !== undefined && (
                <span className={cx('text-xs tabular-nums', on ? 'text-on-ink-accent' : 'text-ink-muted')}>{t.meta}</span>
              )}
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
