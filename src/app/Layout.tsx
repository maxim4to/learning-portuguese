import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import {
  Circle,
  GraduationCap,
  House,
  Layers,
  MessagesSquare,
  Settings2,
  type LucideIcon,
} from 'lucide-react'
import { useRepository } from '@/data'
import { OfflineBanner, UpdatePrompt } from '@/components/AppStatus'
import { cx } from '@/components/cx'
import { AzulejoMark } from '@/components/Logo'
import { ToastProvider } from '@/components/Toast'
import { useFitText } from '@/components/useFitText'
import { useDueCount } from '@/features/srs/useDueCount'
import { SyncToasts } from '@/features/sync/SyncToasts'
import { WordCaptureProvider } from '@/features/words/capture/WordCaptureProvider'
import { WordSearchButton } from '@/features/words/capture/WordSearchButton'
import { isNavActive, NAV_ITEMS } from './nav'

/** Icons by route (one outline icon set for the whole nav). */
const ICONS: Record<string, LucideIcon> = {
  '/': House,
  '/syllabus': GraduationCap,
  '/review': Layers,
  '/practice': MessagesSquare,
  '/settings': Settings2,
}
const iconFor = (to: string) => ICONS[to] ?? Circle

/**
 * Phone tab bar hides while the page scrolls down (reading room for the content under it) and comes back on
 * any scroll up, at the top and at the very end of the page. Transform only; reduced motion drops the slide.
 */
function useTabBarHidden() {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      const atEnd = y + window.innerHeight >= document.documentElement.scrollHeight - 4
      if (y < 64 || atEnd || y < last - 6) setHidden(false)
      else if (y > last + 6) setHidden(true)
      last = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return hidden
}

function DueBadge({ n, className }: { n: number; className?: string }) {
  if (!n) return null
  return (
    <span
      className={cx(
        'inline-grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-xs leading-none font-bold text-on-brand tabular-nums',
        className,
      )}
    >
      {n > 99 ? '99+' : n}
      <span className="sr-only"> к повторению</span>
    </span>
  )
}

/** Logo mark + product name, links home (same in the phone row and the desktop bar). */
function HomeLogo({ size }: { size: number }) {
  return (
    <NavLink to="/" data-halftone-surface="" aria-label="Learning Portuguese — главная" className="flex items-center gap-2.5 text-ink no-underline">
      <AzulejoMark size={size} />
      <span className="font-display text-h2 leading-none font-black whitespace-nowrap">Learning Portuguese</span>
    </NavLink>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  const navType = useNavigationType()
  const repo = useRepository()
  const due = useDueCount(pathname)
  const barHidden = useTabBarHidden()
  // Tab-bar labels shrink together (12 → 11 → 10px, then icons only) when any of them would not fit its cell.
  const tabBarRef = useRef<HTMLUListElement>(null)
  useFitText(tabBarRef, [NAV_ITEMS.map((item) => item.short ?? item.label).join('|')])

  // BrowserRouter has no <ScrollRestoration>: start new pages at the top (back/forward keeps the browser's position).
  useEffect(() => {
    if (navType !== 'POP') window.scrollTo({ top: 0 })
  }, [pathname, navType])

  return (
    <ToastProvider>
      {/* Word capture: tap / select a pt word anywhere → lookup card; «/» → word search. */}
      <WordCaptureProvider>
      <SyncToasts />
      <div className="min-h-dvh">
        <a
          href="#main"
          className="sr-only z-50 rounded-pill bg-ink px-5 py-3 font-semibold text-bg focus:not-sr-only focus:fixed focus:top-[calc(var(--safe-top)+0.5rem)] focus:left-4"
        >
          К содержанию
        </a>

        {/* Phone / tablet: slim product row (not sticky); navigation lives in the bottom tab bar until lg. */}
        <header className="page-container pt-(--safe-top) lg:hidden">
          <div className="flex h-12 items-center justify-between">
            <HomeLogo size={24} />
            <WordSearchButton className="-mr-2.5" />
          </div>
        </header>

        {/* Desktop top bar from lg (fixed height = --header-h; in-page sticky bars stick right under it). */}
        <header className="sticky top-[0px] z-20 hidden h-(--header-h) bg-bg lg:block">
          <div className="page-container flex h-full items-center gap-6">
            <HomeLogo size={32} />
            <WordSearchButton className="ml-auto" />
            <nav aria-label="Основные разделы" className="-ml-3 flex items-center gap-1 rounded-pill bg-surface p-1">
              {NAV_ITEMS.map((item) => {
                const active = isNavActive(item, pathname)
                const Icon = iconFor(item.to)
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'inline-flex h-11 items-center gap-2 rounded-pill px-4 text-sm font-semibold no-underline transition-colors',
                      active ? 'bg-ink text-surface' : 'text-ink hover:bg-surface-2',
                    )}
                  >
                    <Icon aria-hidden className="size-4.5" strokeWidth={active ? 2.25 : 1.9} />
                    {item.label}
                    {item.to === '/review' && <DueBadge n={due} />}
                  </Link>
                )
              })}
            </nav>
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="page-container pt-2 pb-[calc(var(--bottom-chrome)+2.5rem)] outline-none lg:pt-6 lg:pb-20"
        >
          <OfflineBanner synced={repo.kind === 'firestore'} />
          <Outlet />
        </main>

        {/*
          Phone / tablet tab bar: docked full width (no floating pill), one tone step above the canvas with a whisper
          line on top; five equal cells, 22px outline icons over a 12px label; the active cell is ink with a quiet
          neutral pill behind its icon (same box in every cell, so nothing shifts). Height --tabbar-h + home indicator.
        */}
        <nav
          aria-label="Основные разделы"
          className={cx(
            'fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pr-(--safe-right) pb-(--safe-bottom) pl-(--safe-left) transition-transform duration-200 ease-out focus-within:translate-y-0 motion-reduce:transition-none lg:hidden',
            barHidden && 'translate-y-full',
          )}
        >
          <ul ref={tabBarRef} className="mx-auto grid h-(--tabbar-h) max-w-[30rem] grid-cols-5 px-3">
            {NAV_ITEMS.map((item) => {
              const active = isNavActive(item, pathname)
              const Icon = iconFor(item.to)
              return (
                <li key={item.to} className="min-w-0">
                  <Link
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'group flex h-full flex-col items-center justify-center gap-1 rounded-control text-xs font-semibold no-underline transition-colors duration-150 focus-visible:-outline-offset-4',
                      active ? 'text-ink' : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    <span
                      className={cx(
                        'relative grid h-7 w-12 place-items-center rounded-pill transition-[background-color,transform] duration-150 group-active:scale-90 motion-reduce:group-active:scale-100',
                        active ? 'bg-surface-2' : 'group-hover:bg-surface-2/60',
                      )}
                    >
                      <Icon aria-hidden className="size-5.5" strokeWidth={active ? 2.25 : 1.9} />
                      {item.to === '/review' && <DueBadge n={due} className="absolute -top-1.5 -right-1" />}
                    </span>
                    <span
                      data-fit-label=""
                      className={cx(
                        'max-w-full overflow-hidden text-(length:--fit-label-fs) leading-4 whitespace-nowrap in-data-fit-measuring:font-bold in-data-[fit=hidden]:sr-only',
                        active && 'font-bold',
                      )}
                    >
                      {item.short ?? item.label}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <UpdatePrompt />
      </div>
      </WordCaptureProvider>
    </ToastProvider>
  )
}
