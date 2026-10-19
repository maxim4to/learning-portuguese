import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AuthUser } from './auth.ts'
import { AuthContext, type AuthState, type AuthStatus } from './contexts.ts'
import { isFirebaseConfigured } from './firebase.ts'
import { forgetUser, hasSnapshot, readCachedUser, writeCachedUser } from './snapshot.ts'

const loadAuth = () => import('./auth.ts')

/**
 * Last confirmed user whose data snapshot is on this device: rendered at once on reload (local-first);
 * Firebase Auth confirms or rejects it a moment later (`verified`).
 */
function optimisticUser(): AuthUser | null {
  if (!isFirebaseConfigured) return null
  const u = readCachedUser()
  return u && hasSnapshot(u.uid) ? u : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialUser] = useState(optimisticUser)
  const [status, setStatus] = useState<AuthStatus>(!isFirebaseConfigured ? 'disabled' : initialUser ? 'signed-in' : 'loading')
  const [user, setUser] = useState<AuthUser | null>(initialUser)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured) return
    let unsub: (() => void) | undefined
    let cancelled = false
    loadAuth()
      .then((m) =>
        m.subscribeAuth(
          (u) => {
            writeCachedUser(u)
            setUser((prev) => (prev && u && prev.uid === u.uid && prev.email === u.email && prev.displayName === u.displayName && prev.photoURL === u.photoURL ? prev : u))
            setStatus(u ? 'signed-in' : 'signed-out')
            setVerified(!!u)
          },
          (msg) => setError(msg),
        ),
      )
      .then((u) => {
        if (cancelled) u()
        else unsub = u
      })
      .catch((e: unknown) => {
        setError(`Не удалось загрузить Firebase: ${e instanceof Error ? e.message : String(e)}`)
        // Optimistic user (offline start with an uncached SDK chunk): keep working from the snapshot.
        setStatus((s) => (s === 'signed-in' ? s : 'signed-out'))
      })
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      verified,
      error,
      async signIn() {
        setError(null)
        let m: Awaited<ReturnType<typeof loadAuth>> | undefined
        try {
          m = await loadAuth()
          await m.signInWithGoogle()
        } catch (e) {
          setError(m ? m.describeAuthError(e) : `Не удалось загрузить Firebase: ${e instanceof Error ? e.message : String(e)}`)
        }
      },
      async signOut() {
        if (!isFirebaseConfigured) return
        // Stop the live sync and forget this user's device snapshot before the auth token goes away.
        if (user) forgetUser(user.uid)
        await (await loadAuth()).signOutUser()
      },
    }),
    [status, user, verified, error],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
