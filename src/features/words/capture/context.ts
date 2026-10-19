import { createContext, useContext } from 'react'
import type { CaptureTarget } from './hitTest.ts'

export interface OpenLookupOptions {
  /** Opened from the keyboard: focus moves into the card. */
  viaKey?: boolean
  /** Start with «Все слова фразы» expanded. */
  words?: boolean
  /** Force the bottom sheet (touch) or the popover. Default: by screen width and pointer. */
  sheet?: boolean
}

export interface WordCapture {
  /** Opens the lookup card for a target (from hitTest.ts helpers). */
  openLookup(target: CaptureTarget, opts?: OpenLookupOptions): void
  /** Opens the card for the whole text of a pt element (e.g. a button «Слова фразы»). */
  openForElement(el: HTMLElement, opts?: OpenLookupOptions): void
  closeLookup(): void
  /** «/» search dialog. */
  openSearch(): void
}

export const CaptureContext = createContext<WordCapture | null>(null)

/** Imperative access to word capture (null outside the provider). */
export function useWordCapture(): WordCapture | null {
  return useContext(CaptureContext)
}
