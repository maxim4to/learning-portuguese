import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import {
  BookOpen,
  Circle,
  GraduationCap,
  House,
  Layers,
  Library,
  MessagesSquare,
  Settings2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { useRepository } from '@/data'
import { dueCards } from '@/engine/fsrs'
import { OfflineBanner, UpdatePrompt } from '@/components/AppStatus'
import { cx } from '@/components/cx'
import { AzulejoMark } from '@/components/Logo'
import { ToastProvider } from '@/components/Toast'
import { newSeenToday } from '@/features/srs/newCardCounter'
import { isNavActive, NAV_ITEMS } from './nav'

/** Icons by route (one outline icon set for the whole nav). */
const ICONS: Record<string, LucideIcon> = {
  '/': House,
  '/syllabus': GraduationCap,
  '/review': Layers,
  '/library': Library,
  '/situations': MessagesSquare,
  '/settings': Settings2,
  '/tutor': Sparkles,
  '/reading': BookOpen,
}
const iconFor = (to: string) => ICONS[to] ?? Circle

/**
 * Cards due now (for the badge on «Повторение»). Read on start and again after leaving /review —
 * not on every navigation (Firestore reads are billed).
 */
function useDueCount(pathname: string) {
  const repo = useRepository()
  const [due, setDue] = useState(0)
  const prev = useRef<string | null>(null)
  const onReview = pathname.startsWith('/review')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (prev.current?.startsWith('/review') && !onReview) setTick((t) => t + 1)
    prev.current = pathname
  }, [pathname, onReview])
  useEffect(() => {
    let alive = true
    Promise.all([repo.getCards(), repo.getSettings()])
      .then(([cards, settings]) => {
        if (!alive) return
        const live = cards.filter((c) => !(c as { deleted?: boolean }).deleted)
        setDue(dueCards(live, Date.now(), { newPerDay: settings.newCardsPerDay, newSeenToday: newSeenToday() }).length)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [repo, tick])
  return due
}

function DueBadge({ n, className }: { n: number; className?: string }) {
  if (!n) return null
  return (
    <span
      className={cx(
        'inline-grid h-5 min-w-5 place-items-center rounded-full bg-terracotta-fill px-1.5 text-[11px] leading-none font-bold text-white tabular-nums',
        className,
      )}
    >
      {n > 99 ? '99+' : n}
      <span className="sr-only"> к повторению</span>
    </span>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  const navType = useNavigationType()
  const repo = useRepository()
  const due = useDueCount(pathname)

  // BrowserRouter has no <ScrollRestoration>: start new pages at the top (back/forward keeps the browser's position).
  useEffect(() => {
    if (navType !== 'POP') window.scrollTo({ top: 0 })
  }, [pathname, navType])

  return (
    <ToastProvider>
      <div className="min-h-dvh">
        <a
          href="#main"
          className="sr-only z-50 rounded-control bg-ink px-4 py-3 font-semibold text-bg focus:not-sr-only focus:fixed focus:top-[calc(var(--safe-top)+0.5rem)] focus:left-4"
        >
          К содержанию
        </a>

        {/* Desktop top bar (fixed height = --header-h; in-page sticky bars stick right under it). */}
        <header className="sticky top-[0px] z-20 hidden h-(--header-h) border-b border-line bg-bg/85 backdrop-blur-md backdrop-saturate-150 md:block">
          <div className="mx-auto flex h-full max-w-4xl items-center gap-6 px-6">
            <NavLink to="/" aria-label="Português PT — главная" className="flex items-center gap-2 text-ink no-underline">
              <AzulejoMark className="size-7" />
              <span className="font-serif text-xl font-semibold tracking-tight">Português</span>
              <span className="rounded-md bg-terracotta-soft px-1.5 py-0.5 text-[11px] font-bold tracking-wider whitespace-nowrap text-terracotta">
                PT-PT
              </span>
            </NavLink>
            <nav aria-label="Основные разделы" className="ml-auto flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const active = isNavActive(item, pathname)
                const Icon = iconFor(item.to)
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold no-underline transition-colors',
                      active ? 'bg-brand-soft text-brand-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
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
          className="mx-auto max-w-4xl pt-[max(1rem,var(--safe-top))] pr-[max(1rem,var(--safe-right))] pb-[calc(var(--bottom-chrome)+2.5rem)] pl-[max(1rem,var(--safe-left))] outline-none md:px-6 md:pt-8 md:pb-16"
        >
          <OfflineBanner synced={repo.kind === 'firestore'} />
          <Outlet />
        </main>

        {/* Mobile bottom tab bar (height --tabbar-h + home-indicator inset). */}
        <nav
          aria-label="Основные разделы"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/92 pr-(--safe-right) pb-(--safe-bottom) pl-(--safe-left) shadow-bar backdrop-blur-md backdrop-saturate-150 md:hidden"
        >
          <ul className="grid h-(--tabbar-h)" style={{ gridTemplateColumns: `repeat(${NAV_ITEMS.length}, minmax(0, 1fr))` }}>
            {NAV_ITEMS.map((item) => {
              const active = isNavActive(item, pathname)
              const Icon = iconFor(item.to)
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'flex h-full flex-col items-center justify-center gap-1 text-[0.71875rem] leading-none font-semibold tracking-[-0.01em] no-underline',
                      active ? 'text-brand-ink' : 'text-ink-muted',
                    )}
                  >
                    <span
                      className={cx(
                        'relative grid h-8 w-14 place-items-center rounded-full transition-colors duration-200',
                        active && 'bg-brand-soft',
                      )}
                    >
                      <Icon aria-hidden className="size-[22px]" strokeWidth={active ? 2.3 : 1.8} />
                      {item.to === '/review' && <DueBadge n={due} className="absolute -top-1 right-1.5" />}
                    </span>
                    <span className="max-w-full truncate">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <UpdatePrompt />
      </div>
    </ToastProvider>
  )
}
