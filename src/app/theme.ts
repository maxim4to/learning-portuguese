import { useSyncExternalStore } from 'react'

/** Colour theme preference (per device — localStorage, like other UI conveniences). */
export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'ptpt:v1:theme' // keep in sync with the inline script in index.html
const THEME_COLOR = { light: '#FBF7F0', dark: '#0F1311' } as const

const listeners = new Set<() => void>()
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let pref: ThemePref = typeof window !== 'undefined' ? read() : 'system'

function isDark(p: ThemePref) {
  return p === 'dark' || (p === 'system' && !!media?.matches)
}

/** Applies `html.dark` and the browser chrome colour (both theme-color metas, so a forced theme wins over media). */
export function applyTheme(p: ThemePref = pref) {
  const dark = isDark(p)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    if (p === 'system') m.content = m.media.includes('dark') ? THEME_COLOR.dark : THEME_COLOR.light
    else m.content = dark ? THEME_COLOR.dark : THEME_COLOR.light
  })
}

export function setThemePref(p: ThemePref) {
  pref = p
  try {
    if (p === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, p)
  } catch {
    // storage unavailable — the choice lasts for this page load
  }
  applyTheme(p)
  listeners.forEach((l) => l())
}

/** Call once at startup: syncs metas and follows OS changes while the preference is «system». */
export function initTheme() {
  applyTheme()
  media?.addEventListener('change', () => {
    if (pref === 'system') applyTheme()
  })
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => pref,
    () => 'system',
  )
}
