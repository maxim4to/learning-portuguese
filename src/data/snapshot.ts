/**
 * Device snapshot of a signed-in user's data (localStorage, one key per uid) — read synchronously before the
 * first render so pages never start empty — and the last signed-in user (optimistic auth on reload).
 *   ptpt:v1:snap:<uid>    Persisted (see store.ts)
 *   ptpt:v1:auth-user     AuthUser of the last confirmed sign-in
 * Both survive «Сбросить прогресс» (deviceProgress keeps them); sign-out forgets that uid's snapshot.
 */
import type { Persisted, SnapshotStorage } from './store.ts'

/** Same shape as auth.ts `AuthUser` (kept local: this module is DOM/Firebase-free for node tests). */
interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

const PREFIX = 'ptpt:v1:'
export const SNAP_PREFIX = PREFIX + 'snap:'
export const AUTH_USER_KEY = PREFIX + 'auth-user'
/** Snapshots above this size drop the error log (the server listener restores it). */
const MAX_CHARS = 3_000_000

function ls(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

const forgotten = new Set<string>()
const forgetListeners = new Set<(uid: string) => void>()

export function snapshotStorage(uid: string): SnapshotStorage {
  forgotten.delete(uid)
  const key = SNAP_PREFIX + uid
  return {
    load() {
      try {
        const raw = ls()?.getItem(key)
        if (!raw) return null
        const p = JSON.parse(raw) as Persisted
        // Shapes inside `docs` are checked by the store (repairDocs): one broken collection must not crash boot.
        return p && typeof p === 'object' && p.v === 1 && p.docs && typeof p.docs === 'object' ? p : null
      } catch {
        return null
      }
    },
    save(p) {
      if (forgotten.has(uid)) return
      const store = ls()
      if (!store) return
      try {
        let raw = JSON.stringify(p)
        if (raw.length > MAX_CHARS) raw = JSON.stringify({ ...p, docs: { ...p.docs, errors: {} } })
        store.setItem(key, raw)
      } catch {
        // quota: keep the essentials (progress, cards, words, settings)
        try {
          store.setItem(key, JSON.stringify({ ...p, docs: { ...p.docs, errors: {} } }))
        } catch {
          store.removeItem(key)
        }
      }
    },
  }
}

export function hasSnapshot(uid: string): boolean {
  try {
    return !!ls()?.getItem(SNAP_PREFIX + uid)
  } catch {
    return false
  }
}

/** Sign-out: drop this uid's snapshot (and stop the live store from re-saving it). */
export function forgetUser(uid: string): void {
  forgotten.add(uid)
  for (const cb of forgetListeners) cb(uid)
  try {
    ls()?.removeItem(SNAP_PREFIX + uid)
    const cached = readCachedUser()
    if (cached?.uid === uid) ls()?.removeItem(AUTH_USER_KEY)
  } catch {
    // storage unavailable
  }
}

export function onForgetUser(cb: (uid: string) => void): () => void {
  forgetListeners.add(cb)
  return () => {
    forgetListeners.delete(cb)
  }
}

export function readCachedUser(): AuthUser | null {
  try {
    const raw = ls()?.getItem(AUTH_USER_KEY)
    const u = raw ? (JSON.parse(raw) as AuthUser) : null
    return u && typeof u.uid === 'string' ? u : null
  } catch {
    return null
  }
}

export function writeCachedUser(u: AuthUser | null): void {
  try {
    if (u) ls()?.setItem(AUTH_USER_KEY, JSON.stringify(u))
    else ls()?.removeItem(AUTH_USER_KEY)
  } catch {
    // storage unavailable
  }
}
