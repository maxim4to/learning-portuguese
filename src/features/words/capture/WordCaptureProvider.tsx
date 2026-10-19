import { lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Skeleton } from '@/components/EmptyState'
import { useToast } from '@/components/toastContext'
import { useStoredSettings } from '@/data'
import { preloadLexicon } from '@/engine/lexicon/lookup'
import type { WordActionResult } from '../useWords.ts'
import { wordPt } from '../wordOps.ts'
import { isInteractive, isPtArea, targetAtPoint, targetForElement, targetFromSelection, targetIn, type CaptureTarget } from './hitTest.ts'
import { useSourceAnchor } from './anchor.ts'
import { highlightApi, useSavedWordHighlights } from './highlights.ts'
import { CaptureContext, type OpenLookupOptions, type WordCapture } from './context.ts'
import { LookupPopover } from './LookupPopover.tsx'
import { LookupSheet } from './LookupSheet.tsx'
import { SelectionChip } from './SelectionChip.tsx'
import { getLookupOnTap, setLookupOnTapPref, setLookupOpen } from './store.ts'
import { isTap } from './text.ts'

interface Open {
  target: CaptureTarget
  sheet: boolean
  viaKey: boolean
  words: boolean
  /** Element focused before opening (Esc returns there). */
  opener: HTMLElement | null
  seq: number
}

// The card and the search (with the dictionary UI they use) load on first use: the provider sits in every page.
const LookupCard = lazy(() => import('./LookupCard.tsx').then((m) => ({ default: m.LookupCard })))
const WordSearchDialog = lazy(() => import('../WordSearchDialog.tsx').then((m) => ({ default: m.WordSearchDialog })))
const preloadCard = () => void import('./LookupCard.tsx')

const WIDE_FINE = '(min-width: 640px) and (pointer: fine)'
const wantsSheet = (pointerType?: string) =>
  pointerType === 'touch' || pointerType === 'pen' || (typeof window !== 'undefined' && !window.matchMedia(WIDE_FINE).matches)

const isEditable = (el: Element | null) =>
  !!el && (el.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || !!el.closest('[contenteditable]:not([contenteditable="false"])'))


/**
 * Global word capture (mounted once in Layout): listens on the document for taps / clicks, double-clicks,
 * selections and keys over pt text (`lang="pt…"`, see <Pt>), and opens the lookup card — a popover next to
 * the word on desktop, a bottom sheet on phones. Interactive elements and `data-lookup="off"` areas are
 * never hijacked. «/» or Ctrl/⌘+K opens the word search. No per-word spans, no re-render of the text.
 */
export function WordCaptureProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const { pathname } = useLocation()
  useSourceAnchor()
  useSavedWordHighlights()
  const [open, setOpen] = useState<Open | null>(null)
  const [chip, setChip] = useState<{ target: CaptureTarget; bar: boolean } | null>(null)
  const [search, setSearch] = useState(false)
  const [live, setLive] = useState('')
  const titleId = useId()
  const seq = useRef(0)
  const openRef = useRef<Open | null>(null)
  useLayoutEffect(() => {
    openRef.current = open
  }, [open])

  // Settings.lookupOnTap (live from the store; SettingsPage also updates the module state while editing).
  const { lookupOnTap } = useStoredSettings()
  useEffect(() => setLookupOnTapPref(lookupOnTap), [lookupOnTap])

  const openLookup = useCallback((target: CaptureTarget, opts: OpenLookupOptions = {}) => {
    setLookupOpen(true) // synchronous: page key handlers in the same event already see it
    setChip(null)
    const active = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    setOpen((prev) => ({
      target,
      sheet: opts.sheet ?? wantsSheet(),
      viaKey: !!opts.viaKey,
      words: !!opts.words,
      opener: prev?.opener ?? active,
      seq: ++seq.current,
    }))
    setLive(`Выбрано слово «${target.form}»`)
  }, [])

  const closeLookup = useCallback((opts: { restoreFocus?: boolean } = {}) => {
    const cur = openRef.current
    setOpen(null)
    setLookupOpen(false)
    // Drop the selection the card was opened from: a later Enter (e.g. «Дальше» in an exercise) must not reopen it.
    const sel = document.getSelection()
    if (cur && sel && !sel.isCollapsed && sel.rangeCount && cur.target.block.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      sel.removeAllRanges()
    }
    // Back to where the reader was — only when the card had focus (keyboard), not after a mouse open.
    const focusInCard = !!document.activeElement?.closest('[data-lookup-ui]')
    if (opts.restoreFocus && cur && (cur.viaKey || focusInCard)) {
      const el = cur.opener?.isConnected ? cur.opener : cur.target.anchorEl
      // The phone sheet is a modal <dialog>: while it is open the page is inert (focus() is a no-op), and closing
      // it later (on unmount) would send focus back to what was focused before showModal (<body>). Close it first.
      document.querySelector<HTMLDialogElement>('dialog[data-lookup-ui][open]')?.close()
      if (el?.isConnected) {
        if (!el.hasAttribute('tabindex') && !el.matches('a[href], button, input, textarea, select')) el.setAttribute('tabindex', '-1')
        el.focus({ preventScroll: true })
      }
    }
  }, [])

  const openForElement = useCallback(
    (el: HTMLElement, opts: OpenLookupOptions = {}) => {
      const t = targetForElement(el)
      if (t) openLookup(t, { words: true, ...opts })
    },
    [openLookup],
  )

  // Close on navigation.
  const [path, setPath] = useState(pathname)
  if (path !== pathname) {
    setPath(pathname)
    setOpen(null)
    setChip(null)
  }

  useEffect(() => () => setLookupOpen(false), [])
  useEffect(() => setLookupOpen(!!open || search), [open, search])

  // Highlight the looked-up word (CSS Custom Highlight API; no DOM change; silently absent without support).
  useEffect(() => {
    const api = highlightApi()
    const range = open?.target.range
    if (!api || !range) return
    const h = new api.Highlight(range)
    h.priority = 1 // above the saved-word marks
    api.registry.set('lookup-active', h)
    return () => api.registry.delete('lookup-active')
  }, [open])

  // Warm the lexicon chunk: on idle a few seconds after start when the page has pt text.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!document.querySelector('[lang^="pt"]')) return
      const ric = (window as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
      if (ric) ric(preloadLexicon)
      else preloadLexicon()
    }, 3000)
    return () => clearTimeout(t)
  }, [pathname])

  // Pointer, selection and keyboard listeners (one set for the whole app).
  useEffect(() => {
    let down: { x: number; y: number; t: number; type: string } | null = null
    let pointerIsDown = false
    let selTimer: ReturnType<typeof setTimeout> | undefined
    let warmed = false

    const onPointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, t: e.timeStamp, type: e.pointerType }
      pointerIsDown = true
      if (!warmed && isPtArea(e.target as Node)) {
        warmed = true
        preloadLexicon()
        preloadCard()
      }
    }
    const onPointerUp = () => {
      pointerIsDown = false
      scheduleSelection(down?.type === 'touch' ? 400 : 120)
    }

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.detail > 1 || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (!getLookupOnTap()) return
      const d = down
      if (d && !isTap(e.clientX - d.x, e.clientY - d.y, e.timeStamp - d.t)) return
      const sel = document.getSelection()
      if (sel && !sel.isCollapsed) return
      if (isInteractive(e.target as Node)) return
      const target = targetAtPoint(e.clientX, e.clientY)
      if (!target) return
      const cur = openRef.current
      if (cur && cur.target.block === target.block && cur.target.blockStart === target.blockStart) return
      openLookup(target, { sheet: wantsSheet(d?.type) })
    }

    const onDblClick = (e: MouseEvent) => {
      if (isInteractive(e.target as Node)) return
      const target = targetFromSelection()
      if (!target) return
      const cur = openRef.current
      if (cur && cur.target.block === target.block && cur.target.blockStart === target.blockStart) return
      openLookup(target, { sheet: wantsSheet(down?.type) })
    }

    function scheduleSelection(ms: number) {
      clearTimeout(selTimer)
      selTimer = setTimeout(() => {
        if (pointerIsDown) return
        const t = targetFromSelection()
        const cur = openRef.current
        if (!t || (cur && cur.target.block === t.block && cur.target.blockStart === t.blockStart)) {
          setChip(null)
          return
        }
        setChip({ target: t, bar: wantsSheet(down?.type) })
      }, ms)
    }
    const onSelectionChange = () => {
      const sel = document.getSelection()
      if (!sel || sel.isCollapsed) {
        clearTimeout(selTimer)
        setChip(null)
        return
      }
      if (!pointerIsDown) scheduleSelection(down?.type === 'touch' ? 400 : 250) // keyboard / touch handles
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return
      const active = document.activeElement
      const typing = isEditable(active)
      // «/» or Ctrl/⌘+K: word search (not while typing or inside another dialog).
      if (((e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) || (e.code === 'KeyK' && (e.ctrlKey || e.metaKey) && !e.altKey)) && !typing) {
        if (document.querySelector('dialog[open]') || openRef.current) return
        e.preventDefault()
        setLookupOpen(true)
        setSearch(true)
        return
      }
      // Alt+L, or Enter on pt text: lookup of the selection / the focused line.
      const altL = e.code === 'KeyL' && e.altKey && !e.ctrlKey && !e.metaKey
      const enter = e.key === 'Enter' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
      if (!altL && !enter) return
      if (typing || openRef.current) return
      const sel = targetFromSelection()
      if (sel) {
        if (enter && active && active !== document.body && isInteractive(active)) return
        e.preventDefault()
        openLookup(sel, { viaKey: true })
        return
      }
      if (active instanceof HTMLElement && active !== document.body && !isInteractive(active) && isPtArea(active)) {
        const t = targetForElement(active)
        if (!t) return
        e.preventDefault()
        openLookup(t, { viaKey: true, words: true })
      }
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointerup', onPointerUp, true)
    document.addEventListener('pointercancel', onPointerUp, true)
    document.addEventListener('click', onClick)
    document.addEventListener('dblclick', onDblClick)
    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      clearTimeout(selTimer)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointerup', onPointerUp, true)
      document.removeEventListener('pointercancel', onPointerUp, true)
      document.removeEventListener('click', onClick)
      document.removeEventListener('dblclick', onDblClick)
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openLookup])

  const ctx = useMemo<WordCapture>(
    () => ({ openLookup, openForElement, closeLookup: () => closeLookup(), openSearch: () => setSearch(true) }),
    [openLookup, openForElement, closeLookup],
  )

  const isOnAnchor = useCallback((x: number, y: number) => {
    const r = openRef.current?.target.range
    if (!r) return false
    for (const b of r.getClientRects()) if (x >= b.left - 2 && x <= b.right + 2 && y >= b.top - 2 && y <= b.bottom + 2) return true
    return false
  }, [])

  const pickWord = useCallback(
    (start: number, end: number) => {
      const cur = openRef.current
      if (!cur) return
      const t = targetIn(cur.target.block, start, end, { anchorEl: cur.target.anchorEl })
      if (t) openLookup(t, { viaKey: cur.viaKey, sheet: cur.sheet, words: true })
    },
    [openLookup],
  )

  function onSearchAdded(r: WordActionResult) {
    setSearch(false)
    const w = r.words[0]
    toast({ text: w ? `Добавлено в словарь: ${wordPt(w)}` : 'Добавлено в словарь', tone: 'success', action: { label: 'Отменить', onClick: () => void r.undo() } })
  }

  const card = open && (
    <Suspense fallback={<CardFallback titleId={titleId} form={open.target.form} />}>
      <LookupCard
        key={open.seq}
        target={open.target}
        titleId={titleId}
        initialWords={open.words}
        onClose={() => closeLookup({ restoreFocus: open.viaKey })}
        onPickWord={pickWord}
      />
    </Suspense>
  )

  return (
    <CaptureContext.Provider value={ctx}>
      {children}
      <p className="sr-only" role="status" aria-live="polite">
        {live}
      </p>
      {open &&
        (open.sheet ? (
          <LookupSheet titleId={titleId} onClose={() => closeLookup({ restoreFocus: true })}>
            {card}
          </LookupSheet>
        ) : (
          <LookupPopover
            rect={open.target.rect}
            anchorEl={open.target.anchorEl}
            isOnAnchor={isOnAnchor}
            viaKey={open.viaKey}
            titleId={titleId}
            onClose={closeLookup}
          >
            {card}
          </LookupPopover>
        ))}
      {chip && !open && (
        <SelectionChip
          text={chip.target.form}
          rect={lastRect(chip.target)}
          bar={chip.bar}
          onOpen={() => openLookup(chip.target, { sheet: chip.bar })}
        />
      )}
      {search && (
        <Suspense fallback={null}>
          <WordSearchDialog onClose={() => setSearch(false)} onAdded={onSearchAdded} />
        </Suspense>
      )}
    </CaptureContext.Provider>
  )
}

/** While the card's code loads (first lookup only): the word and a skeleton, same title id for the dialog label. */
function CardFallback({ titleId, form }: { titleId: string; form: string }) {
  return (
    <div data-lookup-ui="" role="status" aria-label="Загружаю словарь" className="space-y-3">
      <h2 id={titleId} className="break-words" lang="pt-PT">
        {form}
      </h2>
      <Skeleton className="h-5 w-40 rounded-pill" />
      <Skeleton className="h-11 w-full rounded-pill" />
    </div>
  )
}

function lastRect(t: CaptureTarget): DOMRect {
  const rects = t.range?.getClientRects()
  return rects && rects.length ? rects[rects.length - 1] : t.rect
}
