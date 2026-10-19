export interface NavItem {
  to: string
  label: string
  /**
   * Extra path prefixes (segment-wise) that also mark this item active, e.g. sub-sections living on
   * their own routes. `to` itself always counts.
   */
  match?: string[]
}

/**
 * Main navigation (top bar on desktop, bottom tab bar on mobile — 5 columns).
 * «Практика» = situations (/situations, /situation/:id — the second learning track, default sub-tab) and the
 * reference library (/library and its pages) as the second sub-tab (audit P1-12).
 * «Практика с агентом» (/tutor) has no slot of its own (the bottom bar stays at 5): it is reached from the
 * dashboard card and the «С агентом» tab / section of every topic, situation, text and vocab theme, and
 * highlights «Главная».
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Главная', match: ['/tutor'] },
  { to: '/syllabus', label: 'Курс', match: ['/topic', '/diagnostic'] },
  { to: '/review', label: 'Повторение' },
  { to: '/situations', label: 'Практика', match: ['/situation', '/library'] },
  { to: '/settings', label: 'Настройки' },
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
