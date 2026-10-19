export interface NavItem {
  to: string
  label: string
  /**
   * Extra path prefixes (segment-wise) that also mark this item active, e.g. sub-sections living on
   * their own routes. `to` itself always counts.
   */
  match?: string[]
  /** Shorter label for the phone tab bar (each cell is ~72px wide at 360). */
  short?: string
}

/**
 * Main navigation (top bar on desktop, bottom tab bar on mobile — 5 columns).
 * «Практика» (/practice) has five sub-sections on their own routes — situations (default), cheatsheets, vocab
 * themes, reading, the agent hub — switched by a second-level SubNav (see features/practice). The old URLs
 * (/situations, /situation/:id, /library…, /tutor) redirect there and also keep the item active.
 * «Мой словарь» (/words, /words/:id) lives under «Повторение» as its second sub-tab (ReviewTabs).
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Главная' },
  { to: '/syllabus', label: 'Курс', match: ['/topic', '/diagnostic'] },
  { to: '/review', label: 'Повторение', short: 'Карточки', match: ['/words'] },
  { to: '/practice', label: 'Практика', match: ['/situations', '/situation', '/library', '/tutor'] },
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
