/**
 * Word capture public API (see docs/personal-dictionary.md, «Фаза 2 — как подключить поверхность»):
 * - `<Pt>` (../Pt.tsx) and `lookupAttrs()` (../source.ts) mark pt text, its source and the lock;
 * - `isLookupOpen()` / `useLookupOpen()` — page keyboard shortcuts step aside while the card is open;
 * - `useWordCapture()` — open the card / the search programmatically.
 */
export { isLookupOpen, useLookupOpen, useLookupOnTap, setLookupOnTapPref } from './store.ts'
export { useWordCapture, type OpenLookupOptions, type WordCapture } from './context.ts'
export type { CaptureTarget } from './hitTest.ts'
export { WordCaptureProvider } from './WordCaptureProvider.tsx'
export { WordSearchButton } from './WordSearchButton.tsx'
