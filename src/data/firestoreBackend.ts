/**
 * Firestore backend for the DataStore (loaded lazily). Layout:
 *   users/{uid}/progress/{topicId}   TopicProgress
 *   users/{uid}/cards/{cardId}       SrsCard   (cardId is encodeURIComponent'ed)
 *   users/{uid}/errors/{id}          ErrorEntry
 *   users/{uid}/words/{wordId}       WordEntry (wordId is encodeURIComponent'ed)
 *   users/{uid}/meta/settings        Settings
 * firestore.rules: owner-only; card updates must not carry an older `fsrs.last_review` than the stored card.
 *
 * Reads: one `onSnapshot` listener per collection (+ the settings doc) for the whole session — not per page.
 * With the persistent cache they emit the cached data first, then the server's; while attached, only changed
 * documents are billed, and a re-listen within ~30 min resumes from the cache's resume token (changes only).
 * Writes: `writeBatch` ≤ 450 ops, applied to the local cache at once and queued durably by the SDK while
 * offline (the promise resolves on server acknowledgement). Card updates with an older review than the
 * server's are denied by firestore.rules and resolved in `commit` (the newer review wins).
 */
import type { FirebaseApp } from 'firebase/app'
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore'
import { emulatorHost } from './firebase.ts'
import { PROGRESS_COLS, SETTINGS_ID, isPermissionDenied, type Backend, type BackendSink, type Col, type RemoteChange, type WriteOp } from './store.ts'
import type { SrsCard } from './types.ts'

const BATCH = 450
/** A failed listener (not permission-denied) re-listens after this long. */
const RETRY_MS = 15_000

let dbSingleton: Firestore | null = null

function getDb(app: FirebaseApp): Firestore {
  if (dbSingleton) return dbSingleton
  try {
    dbSingleton = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    })
    if (emulatorHost) connectFirestoreEmulator(dbSingleton, emulatorHost, 8080)
  } catch {
    // already initialized (e.g. HMR)
    dbSingleton = getFirestore(app)
  }
  return dbSingleton
}

const encodeId = (id: string) => encodeURIComponent(id)
const decodeId = (id: string) => {
  try {
    return decodeURIComponent(id)
  } catch {
    return id
  }
}

export class FirestoreBackend implements Backend {
  readonly kind = 'firestore' as const
  private readonly db: Firestore
  private readonly uid: string
  private sink: BackendSink | null = null
  private unsubs: (() => void)[] = []
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private stopOnline: (() => void) | null = null

  constructor(app: FirebaseApp, uid: string) {
    this.db = getDb(app)
    this.uid = uid
  }

  private col(name: Exclude<Col, 'meta'>) {
    return collection(this.db, 'users', this.uid, name)
  }
  private ref(c: Col, id: string): DocumentReference {
    return c === 'meta' ? doc(this.db, 'users', this.uid, 'meta', id) : doc(this.col(c), encodeId(id))
  }

  connect(sink: BackendSink): () => void {
    this.sink = sink
    const on = () => sink.online(true)
    const off = () => sink.online(false)
    globalThis.addEventListener?.('online', on)
    globalThis.addEventListener?.('offline', off)
    this.stopOnline = () => {
      globalThis.removeEventListener?.('online', on)
      globalThis.removeEventListener?.('offline', off)
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) sink.online(false)
    this.listen()
    return () => {
      this.unlisten()
      this.stopOnline?.()
      this.sink = null
    }
  }

  private onError = (e: unknown) => {
    console.warn('[firestore] listener failed', e)
    this.sink?.fail(e)
    if (isPermissionDenied(e)) return
    clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => this.revalidate(), RETRY_MS)
  }

  private listen(): void {
    const sink = this.sink
    if (!sink) return
    for (const name of PROGRESS_COLS) {
      let confirmed = false
      this.unsubs.push(
        onSnapshot(
          this.col(name),
          { includeMetadataChanges: true },
          (snap) => {
            const fromServer = !snap.metadata.fromCache
            if (fromServer && !confirmed) {
              // First server-confirmed view: the complete listing (lets the store drop deleted documents).
              confirmed = true
              sink.remote({ col: name, complete: true, fromServer, changes: snap.docs.map((d) => ({ id: decodeId(d.id), data: d.data() })) })
              return
            }
            const changes = snap
              .docChanges({ includeMetadataChanges: false })
              .map((ch) => ({ id: decodeId(ch.doc.id), data: ch.type === 'removed' ? null : ch.doc.data() }))
            sink.remote({ col: name, changes, fromServer })
          },
          this.onError,
        ),
      )
    }
    this.unsubs.push(
      onSnapshot(
        this.ref('meta', SETTINGS_ID),
        { includeMetadataChanges: true },
        (snap) => {
          const fromServer = !snap.metadata.fromCache
          // «Not in the cache» is not «deleted»: only the server may remove the settings document.
          const changes = snap.exists() ? [{ id: SETTINGS_ID, data: snap.data() }] : fromServer ? [{ id: SETTINGS_ID, data: null }] : []
          sink.remote({ col: 'meta', changes, fromServer })
        },
        this.onError,
      ),
    )
  }

  private unlisten(): void {
    clearTimeout(this.retryTimer)
    for (const u of this.unsubs) u()
    this.unsubs = []
  }

  revalidate(): void {
    if (!this.sink) return
    this.unlisten()
    this.listen()
  }

  /**
   * Commits ops in batches of ≤ 450. SRS cards are guarded by firestore.rules: an update with an older
   * `fsrs.last_review` than the server's is denied (the newer review wins — e.g. an older review queued offline
   * here arriving after a newer one from another device). On such a denial the server's cards are read
   * (only then: reads cost), handed to the store as remote data (it keeps them over its pending write, see
   * store.ts onAck) and the rest of the ops is committed again. Any other denial is rethrown.
   */
  async commit(ops: WriteOp[]): Promise<void> {
    try {
      await this.commitBatches(ops)
    } catch (e) {
      if (!isPermissionDenied(e) || !ops.some((op) => op.col === 'cards' && op.data)) throw e
      const rest = await this.dropOutdatedCards(ops).catch(() => null)
      if (!rest || rest.length === ops.length) throw e // not a card conflict
      if (rest.length) await this.commitBatches(rest)
    }
  }

  private async commitBatches(ops: WriteOp[]): Promise<void> {
    const commits: Promise<void>[] = []
    for (let i = 0; i < ops.length; i += BATCH) {
      const batch = writeBatch(this.db)
      for (const op of ops.slice(i, i + BATCH)) {
        const r = this.ref(op.col, op.id)
        if (op.data === null) batch.delete(r)
        else batch.set(r, op.data)
      }
      commits.push(batch.commit())
    }
    await Promise.all(commits)
  }

  /** `ops` without the card writes the server has a later review for (those server cards go to the sink). */
  private async dropOutdatedCards(ops: WriteOp[]): Promise<WriteOp[]> {
    const cardOps = ops.filter((op) => op.col === 'cards' && op.data)
    const snaps = await Promise.all(cardOps.map((op) => getDocFromServer(this.ref('cards', op.id))))
    const reviewAt = (c: unknown) => (c as Partial<SrsCard> | undefined)?.fsrs?.last_review ?? 0
    const drop = new Set<WriteOp>()
    const newer: RemoteChange[] = []
    cardOps.forEach((op, i) => {
      const server = snaps[i].exists() ? snaps[i].data() : undefined
      if (server && reviewAt(server) > reviewAt(op.data)) {
        drop.add(op)
        newer.push({ id: op.id, data: server })
      }
    })
    if (newer.length) this.sink?.remote({ col: 'cards', changes: newer, fromServer: true })
    return ops.filter((op) => !drop.has(op))
  }

  /** Server listing (cache when offline) — used by «reset» so documents unknown on this device go too. */
  async allIds(): Promise<Partial<Record<Col, string[]>>> {
    const snaps = await Promise.all(PROGRESS_COLS.map((name) => getDocs(this.col(name))))
    return Object.fromEntries(PROGRESS_COLS.map((name, i) => [name, snaps[i].docs.map((d) => decodeId(d.id))]))
  }
}
