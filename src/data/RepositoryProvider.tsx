import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { AccessDenied } from './AccessDenied.tsx'
import { RepositoryContext, useAuth } from './contexts.ts'
import { clearDeviceProgress, emitProgressReset } from './deviceProgress.ts'
import { getFirebaseApp } from './firebase.ts'
import { LocalBackend } from './localBackend.ts'
import { onForgetUser, snapshotStorage } from './snapshot.ts'
import { DataStore } from './store.ts'

/** Re-listen when the tab comes back after this long (the connection may have been dropped meanwhile). */
const REVALIDATE_AFTER_HIDDEN_MS = 10 * 60_000
/** First open without a snapshot: show whatever arrived after this long instead of skeletons. */
const BOOT_TIMEOUT_MS = 8_000

function withDeviceReset(store: DataStore): DataStore {
  store.afterReset = (opts) => {
    clearDeviceProgress(opts)
    emitProgressReset()
  }
  return store
}

let localStore: DataStore | null = null
function getLocalStore(): DataStore {
  if (!localStore) {
    localStore = withDeviceReset(new DataStore({ kind: 'local' }))
    localStore.attach(new LocalBackend())
  }
  return localStore
}

/** One store per uid for the whole page life (navigation and StrictMode remounts never re-fetch). */
const userStores = new Map<string, DataStore>()
function getUserStore(uid: string): DataStore {
  let s = userStores.get(uid)
  if (!s) {
    s = withDeviceReset(new DataStore({ kind: 'firestore', snapshot: snapshotStorage(uid) }))
    userStores.set(uid, s)
  }
  return s
}
onForgetUser((uid) => {
  userStores.get(uid)?.dispose({ persist: false })
  userStores.delete(uid)
})

/** Snapshot on tab hide / close; re-listen after a long absence. */
function useLifecycle(store: DataStore) {
  useEffect(() => {
    let hiddenAt = 0
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        store.flushSave()
      } else if (hiddenAt && Date.now() - hiddenAt >= REVALIDATE_AFTER_HIDDEN_MS) {
        store.revalidate()
      }
    }
    const onHide = () => store.flushSave()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onHide)
    }
  }, [store])
}

/**
 * Provides the local-first DataStore: local mode (localStorage) when Firebase is not configured, otherwise
 * one store per signed-in uid, hydrated from the device snapshot before the first render and synced with
 * Firestore once auth is confirmed. Never blocks rendering on the network: pages read the store
 * synchronously (src/data/hooks.ts). Permission-denied from the listeners shows <AccessDenied>.
 */
export function RepositoryProvider({ children }: { children: ReactNode }) {
  const { status, user, verified, signOut } = useAuth()
  const uid = status === 'signed-in' ? user?.uid : undefined
  const store = useMemo(() => (status === 'disabled' ? getLocalStore() : uid ? getUserStore(uid) : null), [status, uid])

  useEffect(() => {
    if (!store || store.kind !== 'firestore' || !uid || !verified) return
    let cancelled = false
    let attached = false
    Promise.all([getFirebaseApp(), import('./firestoreBackend.ts')])
      .then(([app, m]) => {
        if (cancelled) return
        store.attach(new m.FirestoreBackend(app, uid))
        attached = true
      })
      .catch((e: unknown) => console.error('[sync] could not start Firestore', e))
    const boot = setTimeout(() => store.markReady(), BOOT_TIMEOUT_MS)
    return () => {
      cancelled = true
      clearTimeout(boot)
      if (attached) store.detach()
    }
  }, [store, uid, verified])

  if (!store) return <div className="p-8 text-center text-ink-muted" role="status">Загрузка данных…</div>
  return (
    <RepositoryContext.Provider value={store}>
      <Lifecycle store={store} />
      <AccessGate store={store} onSignOut={() => void signOut()}>
        {children}
      </AccessGate>
    </RepositoryContext.Provider>
  )
}

function Lifecycle({ store }: { store: DataStore }) {
  useLifecycle(store)
  return null
}

function AccessGate({ store, onSignOut, children }: { store: DataStore; onSignOut(): void; children: ReactNode }) {
  const { user } = useAuth()
  const denied = useSyncExternalStore(store.subscribe, () => store.getSync().error === 'permission-denied')
  if (denied) return <AccessDenied user={user} onRetry={() => store.revalidate()} onSignOut={onSignOut} />
  return <>{children}</>
}
