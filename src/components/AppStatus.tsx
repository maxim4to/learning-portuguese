/// <reference types="vite-plugin-pwa/react" />
import { useEffect, useState } from 'react'
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

/**
 * «Доступна новая версия» — the service worker waits for the user instead of reloading mid-lesson
 * (registerType: 'prompt' in vite.config.ts, audit §3.11).
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  if (!needRefresh) return null
  return (
    <div
      className="fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: 'calc(var(--bottom-chrome) + 0.75rem)' }}
    >
      <div
        role="status"
        className="flex w-full max-w-md animate-toast items-center gap-3 rounded-[1.75rem] bg-ink py-2 pr-2 pl-5 text-sm text-bg"
      >
        <RefreshCw aria-hidden className="size-5 shrink-0 opacity-80" />
        <span className="min-w-0 flex-1">Доступна новая версия приложения</span>
        <button
          type="button"
          className="min-h-11 shrink-0 rounded-pill bg-brand px-4 font-bold text-on-brand hover:bg-brand-hover focus-visible:outline-on-ink-accent"
          onClick={() => void updateServiceWorker(true)}
        >
          Обновить
        </button>
        <button
          type="button"
          aria-label="Позже"
          className="grid size-11 shrink-0 place-items-center rounded-full opacity-70 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-on-ink-accent"
          onClick={() => setNeedRefresh(false)}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  )
}
