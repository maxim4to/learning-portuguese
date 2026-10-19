import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { isNavActive, NAV_ITEMS } from './nav'

const linkBase = 'rounded-lg px-3 py-1.5 text-sm font-medium no-underline transition'

export function Layout() {
  const { pathname } = useLocation()
  const navType = useNavigationType()
  // BrowserRouter has no <ScrollRestoration>: start new pages at the top (back/forward keeps the browser's position).
  useEffect(() => {
    if (navType !== 'POP') window.scrollTo({ top: 0 })
  }, [pathname, navType])
  return (
    <div className="min-h-dvh">
      {/* Desktop top bar */}
      <header className="sticky top-0 z-20 hidden border-b border-stone-200 bg-white/90 backdrop-blur md:block dark:border-stone-800 dark:bg-stone-950/90">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-3">
          <NavLink to="/" className="text-lg font-bold text-brand-700 no-underline">
            Português <span className="text-stone-400">PT</span>
          </NavLink>
          <nav className="flex gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isNavActive(item, pathname) ? 'page' : undefined}
                className={`${linkBase} ${isNavActive(item, pathname) ? 'bg-brand-50 text-brand-800 dark:bg-brand-800/30 dark:text-brand-100' : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-4 pb-28 md:px-6 md:pt-8 md:pb-12">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-stone-800 dark:bg-stone-950/95">
        <ul className="grid grid-cols-5">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={isNavActive(item, pathname) ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] no-underline ${isNavActive(item, pathname) ? 'text-brand-700 dark:text-brand-500' : 'text-stone-500'}`}
              >
                <span aria-hidden className="text-xl leading-none">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
