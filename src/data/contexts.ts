import { createContext, useContext } from 'react'
import type { AuthUser } from './auth.ts'
import type { ProgressRepository } from './types.ts'

export type AuthStatus = 'disabled' | 'loading' | 'signed-in' | 'signed-out'

export interface AuthState {
  /** 'disabled' when Firebase is not configured (local mode). */
  status: AuthStatus
  user: AuthUser | null
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

export const RepositoryContext = createContext<ProgressRepository | null>(null)

/** The active progress repository (Local or Firestore). Must be under <RepositoryProvider>. */
export function useRepository(): ProgressRepository {
  const ctx = useContext(RepositoryContext)
  if (!ctx) throw new Error('useRepository must be used inside <RepositoryProvider>')
  return ctx
}
