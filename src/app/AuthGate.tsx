import type { ReactNode } from 'react'
import { useAuth } from '@/data'

/** When Firebase is configured, requires Google sign-in; otherwise renders children as is. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, signIn, error } = useAuth()

  if (status === 'disabled' || status === 'signed-in') return <>{children}</>

  if (status === 'loading') {
    return <div className="flex min-h-dvh items-center justify-center text-stone-500">Загрузка…</div>
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="card w-full max-w-sm space-y-4 text-center">
        <h1>Português PT</h1>
        <p className="text-stone-600 dark:text-stone-400">Войдите, чтобы синхронизировать прогресс между устройствами.</p>
        <button className="btn-primary w-full" onClick={() => void signIn()}>
          Войти через Google
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
