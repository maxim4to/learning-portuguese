import { createContext, useContext } from 'react'
import type { AuthUser } from './auth.ts'
import type { DataStore } from './store.ts'
import type { ProgressRepository } from './types.ts'

export type AuthStatus = 'disabled' | 'loading' | 'signed-in' | 'signed-out'

export interface AuthState {
  /** 'disabled' when Firebase is not configured (local mode). */
  status: AuthStatus
  user: AuthUser | null
  /**
   * Firebase Auth has confirmed `user` in this session. On reload the last user is restored optimistically
   * (status 'signed-in', verified false) so the app renders from the device snapshot at once; the server
   * sync starts once verified.
   */
  verified: boolean
  signIn(): Promise<void>
  signOut(): Promise<void>
  error: string | null
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** The active data store (local-first; also the ProgressRepository). */
export const RepositoryContext = createContext<DataStore | null>(null)

/** The active progress repository (writes are optimistic). Must be under <RepositoryProvider>. */
export function useRepository(): ProgressRepository {
  return useDataStore()
}

/** The active data store — for synchronous reads prefer the hooks in ./hooks.ts. */
export function useDataStore(): DataStore {
  const ctx = useContext(RepositoryContext)
  if (!ctx) throw new Error('useRepository must be used inside <RepositoryProvider>')
  return ctx
}
