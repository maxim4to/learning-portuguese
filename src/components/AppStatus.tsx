/// <reference types="vite-plugin-pwa/react" />
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { CloudOff, RefreshCw, X } from 'lucide-react'

/** Thin banner while the device is offline (audit §5). */
export function OfflineBanner({ synced }: { synced: boolean }) {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  if (online) return null
  return (
    <div role="status" className="mb-4 flex items-center gap-2 rounded-control bg-sun-soft px-4 py-2.5 text-sm text-sun">
      <CloudOff aria-hidden className="size-4 shrink-0" />
      <span>
        Нет сети — {synced ? 'прогресс сохранится и синхронизируется, когда связь вернётся.' : 'всё работает, прогресс сохраняется на устройстве.'}
      </span>
    </div>
  )
}

const BASE = import.meta.env.BASE_URL
const RELOAD_GUARD_KEY = 'pwa-update-reload-at'
const RELOAD_GUARD_MS = 30_000
const UPDATE_CHECK_MS = 60 * 60 * 1000
const DISMISS_KEY = 'pwa-update-dismissed'
/** How long «Обновить» waits for a still-downloading version (precache is a few MB) before giving up on it. */
const INSTALL_WAIT_MS = 30_000
/** After SKIP_WAITING: reload on controllerchange/activation, or hard-reload after this long regardless. */
const ACTIVATE_FALLBACK_MS = 4_000

const hasSW = typeof navigator !== 'undefined' && 'serviceWorker' in navigator

/**
 * Was a new service worker already waiting when this page loaded? Then the update was downloaded during an earlier
 * visit and the user has just opened or reloaded the page — nothing is in progress yet, so it can be applied silently.
 * Measured before useRegisterSW registers (its «waiting» event fires for both cases and can't tell them apart).
 */
const waitingAtStartup: Promise<boolean> = hasSW
  ? navigator.serviceWorker
      .getRegistration(BASE)
      .then((r) => Boolean(r?.waiting && r.active))
      .catch(() => false)
  : Promise.resolve(false)

/**
 * A reload also makes the browser check sw.js, so a fresh update often finishes installing a moment *after* the page
 * loaded. If that happens within STARTUP_WINDOW_MS and the user hasn't touched anything yet, it still counts as startup.
 */
const STARTUP_WINDOW_MS = 15_000
const loadedAt = Date.now()
let interacted = false
if (typeof window !== 'undefined') {
  const mark = () => {
    interacted = true
  }
  for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, mark, { capture: true, once: true })
}
function isStartup(wasWaiting: boolean): boolean {
  return wasWaiting || (!interacted && Date.now() - loadedAt < STARTUP_WINDOW_MS)
}

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}
function writeSession(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {
    /* storage unavailable — the guard just doesn't persist */
  }
}

/** Guards against a reload loop: at most one automatic update reload per RELOAD_GUARD_MS in this tab. */
function mayAutoReload(): boolean {
  const at = Number(readSession(RELOAD_GUARD_KEY))
  return !(at && Date.now() - at < RELOAD_GUARD_MS)
}

let reloading = false
/** This tab asked for the switch (so a controllerchange here is ours to reload on). */
let switching = false
function reloadOnce() {
  if (reloading) return
  reloading = true
  window.location.reload()
}

/** Resolves when `sw` reaches one of `states` (true), turns redundant or `ms` passes (false). */
function waitForState(sw: ServiceWorker, states: ServiceWorkerState[], ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (states.includes(sw.state)) return resolve(true)
    const finish = (ok: boolean) => {
      window.clearTimeout(timer)
      sw.removeEventListener('statechange', onChange)
      resolve(ok)
    }
    const onChange = () => {
      if (states.includes(sw.state)) finish(true)
      else if (sw.state === 'redundant') finish(false)
    }
    const timer = window.setTimeout(finish, ms, false)
    sw.addEventListener('statechange', onChange)
  })
}

/**
 * Switches to the newest downloaded version and reloads — always ends in a reload, so the button is never dead.
 * Reads the registration afresh (several deploys may have landed since the banner appeared): on a click, if a newer
 * version is still downloading, waits for it; then tells the waiting worker to skip waiting and reloads once it controls the page
 * or is activated (an uncontrolled page — e.g. after Shift+Cmd+R — never gets controllerchange), with a hard reload
 * as the fallback. Not via workbox-window's messageSkipWaiting: it targets the worker from when the page loaded and
 * silently does nothing when none is waiting.
 */
async function activateNewestAndReload(waitForDownload: boolean) {
  switching = true
  const reg = await navigator.serviceWorker.getRegistration(BASE).catch(() => undefined)
  if (!reg) return reloadOnce()
  if (waitForDownload && reg.installing) await waitForState(reg.installing, ['installed', 'activating', 'activated'], INSTALL_WAIT_MS)
  const next = reg.waiting
  // Nothing waiting: it was activated meanwhile (another tab) or the download failed — a reload picks up what's there.
  if (!next) return reloadOnce()
  navigator.serviceWorker.addEventListener('controllerchange', reloadOnce, { once: true })
  void waitForState(next, ['activated'], ACTIVATE_FALLBACK_MS).then(reloadOnce)
  next.postMessage({ type: 'SKIP_WAITING' })
}

/**
 * «Доступна новая версия» — never reloads mid-lesson (registerType: 'prompt' in vite.config.ts, audit §3.11):
 * - an update downloaded on an earlier visit is applied silently on the next open/reload (nothing is in progress yet);
 * - an update found while the app is open shows the banner; «Позже» hides it for this session, and it is applied on the
 *   next page change (the new page starts fresh anyway) or the next reload;
 * - updates are checked hourly and whenever the tab becomes visible again.
 * The banner appears only once the new version is fully downloaded (workbox «waiting» = state `installed`).
 */
export function UpdatePrompt() {
  const [dismissed, setDismissed] = useState(() => readSession(DISMISS_KEY) === '1')
  const [applying, setApplying] = useState(false)
  // Banner only after deciding it's a mid-session update (avoids a flash before a silent startup update).
  const [prompt, setPrompt] = useState(false)
  const { pathname } = useLocation()
  const startPath = useRef(pathname)

  useRegisterSW({
    // The new version took over — from this tab, or from another tab that updated. workbox would reload here; another
    // tab's update must not reload this one mid-lesson, so it gets the banner instead («Обновить» then just reloads).
    onNeedReload() {
      if (switching) reloadOnce()
      else setPrompt(true)
    },
    onNeedRefresh() {
      void waitingAtStartup.then((wasWaiting) => {
        if (isStartup(wasWaiting) && mayAutoReload()) apply(true)
        else setPrompt(true)
      })
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine === false || registration.installing) return
        registration.update().catch(() => {
          /* offline or server hiccup — try again later */
        })
      }
      window.setInterval(check, UPDATE_CHECK_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })

  /** `auto`: not a click — counts towards the reload-loop guard. */
  function apply(auto: boolean) {
    if (applying) return
    setApplying(true)
    if (auto) writeSession(RELOAD_GUARD_KEY, String(Date.now()))
    writeSession(DISMISS_KEY, null)
    // Automatic paths don't wait for a newer download: the page must reload right away, before the user starts.
    void activateNewestAndReload(!auto)
  }

  // A pending update is applied on the next page change: the page being left is done with, the new one starts fresh.
  useEffect(() => {
    if (pathname === startPath.current) return
    startPath.current = pathname
    if (prompt && !applying && mayAutoReload()) apply(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only page changes should trigger this
  }, [pathname])

  if (!prompt || (dismissed && !applying)) return null
  return (
    <div
      className="fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: 'calc(var(--bottom-chrome) + 0.75rem)' }}
    >
      <div
        role="status"
        className="flex w-full max-w-md animate-toast items-center gap-3 rounded-card bg-ink py-2 pr-2 pl-5 text-sm text-bg"
      >
        <RefreshCw aria-hidden className={`size-5 shrink-0 opacity-80 ${applying ? 'motion-safe:animate-spin' : ''}`} />
        <span className="min-w-0 flex-1">{applying ? 'Обновляем приложение…' : 'Доступна новая версия приложения'}</span>
        <button
          type="button"
          className="btn-primary btn-sm shrink-0 focus-visible:outline-on-ink-accent disabled:opacity-70"
          disabled={applying}
          aria-busy={applying}
          onClick={() => apply(false)}
        >
          {applying ? 'Обновляем…' : 'Обновить'}
        </button>
        {!applying && (
          <button
            type="button"
            aria-label="Позже"
            title="Позже"
            className="btn btn-icon shrink-0 opacity-70 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-on-ink-accent"
            onClick={() => {
              setDismissed(true)
              writeSession(DISMISS_KEY, '1')
            }}
          >
            <X aria-hidden className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}
