/**
 * Firestore-backed repository with offline persistence (IndexedDB cache, multi-tab).
 * Layout:
 *   users/{uid}/progress/{topicId}   TopicProgress
 *   users/{uid}/cards/{cardId}       SrsCard   (cardId is encodeURIComponent'ed)
 *   users/{uid}/errors/{id}          ErrorEntry
 *   users/{uid}/meta/settings        Settings
 * Writes and deletes are batched (≤ 450 ops per batch).
 *
 * NB: Firestore write promises resolve only after the server acknowledges them, which
 * never happens while offline. Writes are therefore applied to the local cache and NOT
 * awaited (`fire()`); errors are logged. Subsequent reads see the local cache immediately.
 */
import type { FirebaseApp } from 'firebase/app'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore'
import {
  DEFAULT_SETTINGS,
  applyResult,
  newId,
  parseExportBundle,
  type ErrorEntry,
  type ErrorEntryInput,
  type ExportBundle,
  type ProgressRepository,
  type Settings,
  type SrsCard,
  type TopicProgress,
  type TopicResult,
} from './types.ts'

let dbSingleton: Firestore | null = null

function getDb(app: FirebaseApp): Firestore {
  if (dbSingleton) return dbSingleton
  try {
    dbSingleton = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    })
  } catch {
    // already initialized (e.g. HMR)
    dbSingleton = getFirestore(app)
  }
  return dbSingleton
}

const docId = (id: string) => encodeURIComponent(id)

export function isPermissionDenied(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'permission-denied'
}

const permissionDeniedListeners = new Set<() => void>()

/** Subscribe to permission-denied errors from background writes; returns unsubscribe. */
export function onPermissionDenied(cb: () => void): () => void {
  permissionDeniedListeners.add(cb)
  return () => permissionDeniedListeners.delete(cb)
}

function fire(p: Promise<unknown>): void {
  p.catch((e: unknown) => {
    console.error('[firestore] write failed', e)
    if (isPermissionDenied(e)) for (const cb of permissionDeniedListeners) cb()
  })
}

export class FirestoreRepository implements ProgressRepository {
  readonly kind = 'firestore' as const
  private readonly db: Firestore
  private readonly uid: string

  constructor(app: FirebaseApp, uid: string) {
    this.db = getDb(app)
    this.uid = uid
  }

  /**
   * Checks that security rules let this user in. Resolves to 'denied' on permission-denied,
   * 'ok' otherwise (including offline / other errors: those must not block the app).
   */
  async checkAccess(): Promise<'ok' | 'denied'> {
    try {
      await getDoc(this.settingsRef())
      return 'ok'
    } catch (e) {
      if (isPermissionDenied(e)) return 'denied'
      console.warn('[firestore] access check failed', e)
      return 'ok'
    }
  }

  private col(name: 'progress' | 'cards' | 'errors') {
    return collection(this.db, 'users', this.uid, name)
  }
  private settingsRef() {
    return doc(this.db, 'users', this.uid, 'meta', 'settings')
  }

  private async batchSet(items: { ref: DocumentReference; data: object }[]) {
    for (let i = 0; i < items.length; i += 450) {
      const batch = writeBatch(this.db)
      for (const { ref, data } of items.slice(i, i + 450)) batch.set(ref, data)
      fire(batch.commit())
    }
  }

  private async batchDelete(refs: DocumentReference[]) {
    for (let i = 0; i < refs.length; i += 450) {
      const batch = writeBatch(this.db)
      for (const ref of refs.slice(i, i + 450)) batch.delete(ref)
      fire(batch.commit())
    }
  }

  async getTopicProgress(topicId: string) {
    const snap = await getDoc(doc(this.col('progress'), docId(topicId)))
    return snap.exists() ? (snap.data() as TopicProgress) : undefined
  }

  async saveTopicResult(result: TopicResult) {
    const prev = await this.getTopicProgress(result.topicId)
    const next = applyResult(prev, result)
    fire(setDoc(doc(this.col('progress'), docId(result.topicId)), next))
    return next
  }

  async getAllProgress() {
    const snap = await getDocs(this.col('progress'))
    return snap.docs.map((d) => d.data() as TopicProgress)
  }

  async getCards() {
    const snap = await getDocs(this.col('cards'))
    return snap.docs.map((d) => d.data() as SrsCard)
  }

  async upsertCards(cards: SrsCard[]) {
    await this.batchSet(cards.map((c) => ({ ref: doc(this.col('cards'), docId(c.id)), data: c })))
  }

  async deleteCards(ids: string[]) {
    await this.batchDelete(ids.map((id) => doc(this.col('cards'), docId(id))))
  }

  async logError(entry: ErrorEntryInput) {
    const e: ErrorEntry = { ...entry, id: newId() }
    fire(setDoc(doc(this.col('errors'), e.id), e))
    return e
  }

  async getErrors() {
    const snap = await getDocs(this.col('errors'))
    return snap.docs.map((d) => d.data() as ErrorEntry).sort((a, b) => b.at - a.at)
  }

  async getSettings(): Promise<Settings> {
    const snap = await getDoc(this.settingsRef())
    return { ...DEFAULT_SETTINGS, ...(snap.exists() ? (snap.data() as Partial<Settings>) : {}) }
  }

  async saveSettings(patch: Partial<Settings>) {
    const next = { ...(await this.getSettings()), ...patch }
    fire(setDoc(this.settingsRef(), next))
    return next
  }

  async exportAll(): Promise<ExportBundle> {
    const [progress, cards, errors, settings] = await Promise.all([
      this.getAllProgress(),
      this.getCards(),
      this.getErrors(),
      this.getSettings(),
    ])
    return { app: 'portugues-pt', version: 1, exportedAt: Date.now(), progress, cards, errors, settings }
  }

  async importAll(data: ExportBundle | string) {
    const b = parseExportBundle(data)
    await this.batchSet([
      ...b.progress.map((p) => ({ ref: doc(this.col('progress'), docId(p.topicId)), data: p })),
      ...b.cards.map((c) => ({ ref: doc(this.col('cards'), docId(c.id)), data: c })),
      ...b.errors.map((e) => ({ ref: doc(this.col('errors'), e.id), data: e })),
      { ref: this.settingsRef(), data: b.settings },
    ])
  }
}
