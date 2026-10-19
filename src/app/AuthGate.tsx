import type { ReactNode } from 'react'
import { AzulejoCorner } from '@/components/Card'
import { AzulejoMark } from '@/components/Logo'
import { useAuth } from '@/data'

/** When Firebase is configured, requires Google sign-in; otherwise renders children as is. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, signIn, error } = useAuth()

  if (status === 'disabled' || status === 'signed-in') return <>{children}</>

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Загрузка">
        <AzulejoMark size={40} className="animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div data-halftone-surface="" className="card-raised relative isolate w-full max-w-sm space-y-4 overflow-hidden rounded-hero p-6 text-center">
        <AzulejoCorner opacity={0.7} />
        <AzulejoMark size={48} className="mx-auto" />
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
