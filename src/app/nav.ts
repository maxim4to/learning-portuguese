export interface NavItem {
  to: string
  label: string
  icon: string
  /**
   * Extra path prefixes (segment-wise) that also mark this item active, e.g. sub-sections living on
   * their own routes. `to` itself always counts.
   */
  match?: string[]
}

/**
 * Main navigation (top bar on desktop, bottom tab bar on mobile — 5 columns).
 * «Материалы» = library hub (/library) with a sub-tab to situations (/situations, /situation/:id).
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Главная', icon: '🏠' },
  { to: '/syllabus', label: 'Курс', icon: '📚', match: ['/topic', '/diagnostic'] },
  { to: '/review', label: 'Повторение', icon: '🔁' },
  { to: '/library', label: 'Материалы', icon: '📖', match: ['/situations', '/situation'] },
  { to: '/settings', label: 'Настройки', icon: '⚙️' },
]

/** True if `pathname` equals `prefix` or is nested under it (segment boundary, so /situation ≠ /situations). */
function underPath(pathname: string, prefix: string): boolean {
  if (prefix === '/') return pathname === '/'
  const p = prefix.replace(/\/+$/, '')
  return pathname === p || pathname.startsWith(`${p}/`)
}

/** Whether a nav item is active for the router-relative `pathname` ('/' is exact-only). */
export function isNavActive(item: NavItem, pathname: string): boolean {
  return [item.to, ...(item.match ?? [])].some((prefix) => underPath(pathname, prefix))
}
