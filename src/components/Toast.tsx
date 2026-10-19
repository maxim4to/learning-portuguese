import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { cx } from './cx'
import { ToastContext, type ToastOptions } from './toastContext'

interface Item extends ToastOptions {
  id: number
}

/** One toast at a time (newest replaces the previous), polite live region always mounted. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<Item | null>(null)
  const seq = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const dismiss = useCallback(() => {
    clearTimeout(timer.current)
    setItem(null)
  }, [])

  const show = useCallback((t: ToastOptions) => {
    clearTimeout(timer.current)
    setItem({ ...t, id: ++seq.current })
    timer.current = setTimeout(() => setItem(null), t.duration ?? 5000)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  const Icon = item?.tone === 'danger' ? TriangleAlert : item?.tone === 'success' ? CircleCheck : Info

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
        style={{ bottom: 'calc(var(--bottom-chrome) + 0.75rem)' }}
      >
        <div role="status" aria-live="polite" className="w-full max-w-md">
          {item && (
            <div
              key={item.id}
              className="pointer-events-auto flex animate-toast items-center gap-3 rounded-[1.75rem] bg-ink py-2 pr-2 pl-5 text-sm text-bg"
            >
              <Icon
                aria-hidden
                className={cx('size-5 shrink-0', item.tone === 'danger' ? 'text-danger-line' : 'opacity-80')}
              />
              <span className="min-w-0 flex-1 py-1.5">{item.text}</span>
              {item.action && (
                <button
                  type="button"
                  className="min-h-11 shrink-0 rounded-pill px-3 font-bold text-on-ink-accent focus-visible:outline-on-ink-accent underline-offset-2 hover:underline"
                  onClick={() => {
                    item.action!.onClick()
                    dismiss()
                  }}
                >
                  {item.action.label}
                </button>
              )}
              <button
                type="button"
                aria-label="Закрыть уведомление"
                className="grid size-11 shrink-0 place-items-center rounded-full opacity-70 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-on-ink-accent"
                onClick={dismiss}
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToastContext.Provider>
  )
}
