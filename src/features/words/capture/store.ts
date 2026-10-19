/**
 * Small module state of word capture, readable outside React:
 * - `lookupOnTap` (Settings.lookupOnTap) — the provider loads it, SettingsPage updates it live;
 * - whether a lookup card is open (`document.body.dataset.lookupOpen`), so page-level keyboard
 *   shortcuts (1–4, Space, Enter…) can step aside: `if (isLookupOpen()) return`.
 */
import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
let tapPref = true
let open = false

const emit = () => listeners.forEach((l) => l())
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}

export function getLookupOnTap(): boolean {
  return tapPref
}

/** Keeps the capture provider in sync with Settings.lookupOnTap (call after saving the setting). */
export function setLookupOnTapPref(v: boolean): void {
  if (tapPref === v) return
  tapPref = v
  emit()
}

export function useLookupOnTap(): boolean {
  return useSyncExternalStore(subscribe, () => tapPref)
}

/** True while the lookup card (popover / sheet) or the word search is open. Synchronous — safe in keydown handlers. */
export function isLookupOpen(): boolean {
  return open || (typeof document !== 'undefined' && document.body.dataset.lookupOpen !== undefined)
}

export function setLookupOpen(v: boolean): void {
  if (open === v) return
  open = v
  if (typeof document !== 'undefined') {
    if (v) document.body.dataset.lookupOpen = ''
    else delete document.body.dataset.lookupOpen
  }
  emit()
}

/** Re-renders when the lookup card opens / closes. */
export function useLookupOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open)
}
