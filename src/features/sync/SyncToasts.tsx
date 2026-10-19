import { useEffect } from 'react'
import { useDataStore } from '@/data'
import { useToast } from '@/components/toastContext'

/** A write the server rejected was rolled back in the store: tell the learner (mounted once, inside ToastProvider). */
export function SyncToasts() {
  const store = useDataStore()
  const toast = useToast()
  useEffect(
    () =>
      store.onWriteError(({ error }) => {
        const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
        if (code === 'permission-denied') return // <AccessDenied> explains this one
        toast({
          text: `Не удалось сохранить изменения — они отменены${error instanceof Error ? `: ${error.message}` : ''}`,
          tone: 'danger',
          duration: 8000,
        })
      }),
    [store, toast],
  )
  return null
}
