import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AuthUser } from './auth.ts'
import { AuthContext, type AuthState, type AuthStatus } from './contexts.ts'
import { isFirebaseConfigured } from './firebase.ts'

const loadAuth = () => import('./auth.ts')

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(isFirebaseConfigured ? 'loading' : 'disabled')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured) return
    let unsub: (() => void) | undefined
    let cancelled = false
    loadAuth()
      .then((m) =>
        m.subscribeAuth(
          (u) => {
            setUser(u)
            setStatus(u ? 'signed-in' : 'signed-out')
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
        setStatus('signed-out')
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
        await (await loadAuth()).signOutUser()
      },
    }),
    [status, user, error],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
