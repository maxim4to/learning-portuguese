import { useEffect, useState, type ReactNode } from 'react'
import { AccessDenied } from './AccessDenied.tsx'
import { LocalRepository } from './LocalRepository.ts'
import { RepositoryContext, useAuth } from './contexts.ts'
import { getFirebaseApp } from './firebase.ts'
import type { ProgressRepository } from './types.ts'

const local = new LocalRepository()

type Remote =
  | { uid: string; state: 'ready'; repo: ProgressRepository }
  | { uid: string; state: 'denied' }
  | { uid: string; state: 'error'; message: string }

/**
 * Provides the repository: Firestore (per signed-in uid) when Firebase is configured,
 * otherwise LocalRepository. Must be rendered inside <AuthGate> so that a user exists.
 * If security rules reject the user (email not in firestore.rules / rules not deployed),
 * shows an explanation instead of failing silently.
 */
export function RepositoryProvider({ children }: { children: ReactNode }) {
  const { status, user, signOut } = useAuth()
  const uid = status === 'signed-in' ? user?.uid : undefined
  const [remote, setRemote] = useState<Remote | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    let unsubDenied: (() => void) | undefined
    Promise.all([getFirebaseApp(), import('./FirestoreRepository.ts')])
      .then(async ([app, m]) => {
        const repo = new m.FirestoreRepository(app, uid)
        const access = await repo.checkAccess()
        if (cancelled) return
        if (access === 'denied') {
          setRemote({ uid, state: 'denied' })
          return
        }
        setRemote({ uid, state: 'ready', repo })
        unsubDenied = m.onPermissionDenied(() => setRemote({ uid, state: 'denied' }))
      })
      .catch((e: unknown) => {
        if (!cancelled) setRemote({ uid, state: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
      unsubDenied?.()
    }
  }, [uid, attempt])

  if (status === 'disabled') {
    return <RepositoryContext.Provider value={local}>{children}</RepositoryContext.Provider>
  }
  if (!uid || remote?.uid !== uid) {
    return <div className="p-8 text-center text-stone-500">Загрузка данных…</div>
  }
  if (remote.state === 'denied') {
    return (
      <AccessDenied
        user={user}
        onRetry={() => {
          setRemote(null)
          setAttempt((n) => n + 1)
        }}
        onSignOut={() => void signOut()}
      />
    )
  }
  if (remote.state === 'error') {
    return (
      <div className="p-8 text-center text-red-600" role="alert">
        Не удалось подключиться к Firestore: {remote.message}
      </div>
    )
  }
  return <RepositoryContext.Provider value={remote.repo}>{children}</RepositoryContext.Provider>
}
