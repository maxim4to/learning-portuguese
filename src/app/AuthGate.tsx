import type { ReactNode } from 'react'
import { AzulejoMark } from '@/components/Logo'
import { useAuth } from '@/data'

/** When Firebase is configured, requires Google sign-in; otherwise renders children as is. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, signIn, error } = useAuth()

  if (status === 'disabled' || status === 'signed-in') return <>{children}</>

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Загрузка">
        <AzulejoMark className="size-10 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="card-raised w-full max-w-sm space-y-4 rounded-hero p-6 text-center">
        <AzulejoMark className="mx-auto size-12" />
        <h1>Português</h1>
        <p className="text-ink-muted">Войдите, чтобы синхронизировать прогресс между устройствами.</p>
        <button className="btn-primary w-full" onClick={() => void signIn()}>
          Войти через Google
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  )
}
