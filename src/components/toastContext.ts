import { createContext, useContext } from 'react'

export interface ToastOptions {
  text: string
  /** Optional action button, e.g. «Отменить». */
  action?: { label: string; onClick(): void }
  tone?: 'neutral' | 'success' | 'danger'
  /** ms; default 5000 */
  duration?: number
}

export const ToastContext = createContext<(t: ToastOptions) => void>(() => {})

/** Shows a transient message above the bottom bar (needs <ToastProvider> — mounted in Layout). */
export function useToast() {
  return useContext(ToastContext)
}
