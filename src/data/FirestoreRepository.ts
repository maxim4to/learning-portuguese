/**
 * Firestore-backed repository with offline persistence (IndexedDB cache, multi-tab).
 * Layout:
 *   users/{uid}/progress/{topicId}   TopicProgress
 *   users/{uid}/cards/{cardId}       SrsCard   (cardId is encodeURIComponent'ed)
 *   users/{uid}/errors/{id}          ErrorEntry
 *   users/{uid}/words/{wordId}       WordEntry (personal dictionary; wordId is encodeURIComponent'ed)
 *   users/{uid}/meta/settings        Settings
 * Keep USER_COLLECTIONS in sync with this list (resetProgress deletes every document in them).
 * Writes and deletes are batched (≤ 450 ops per batch). `saveWordBundle` puts entries, cards
 * and deletes in one batch (atomic) when they fit into 450 ops.
 * firestore.rules: the `users/{uid}/{document=**}` owner wildcard already covers `words`.
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
  type ResetOptions,
  type Settings,
  type SrsCard,
  type TopicProgress,
  type TopicResult,
  type WordBundleWrite,
  type WordEntry,
} from './types.ts'
import { clearDeviceProgress, emitProgressReset } from './deviceProgress.ts'

/** Every per-user collection except `meta` (settings). */
const USER_COLLECTIONS = ['progress', 'cards', 'errors', 'words'] as const
type UserCollection = (typeof USER_COLLECTIONS)[number]
/** Firestore allows ≤ 500 writes per batch. */
const RESET_BATCH = 450

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

  private col(name: UserCollection) {
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

  /** Sets then deletes, ≤ 450 ops per batch (a single atomic batch when it fits). */
  private async batchMixed(sets: { ref: DocumentReference; data: object }[], deletes: DocumentReference[]) {
    const ops: ({ kind: 'set'; ref: DocumentReference; data: object } | { kind: 'delete'; ref: DocumentReference })[] = [
      ...sets.map((x) => ({ kind: 'set' as const, ...x })),
      ...deletes.map((ref) => ({ kind: 'delete' as const, ref })),
    ]
    for (let i = 0; i < ops.length; i += 450) {
      const batch = writeBatch(this.db)
      for (const op of ops.slice(i, i + 450)) {
        if (op.kind === 'set') batch.set(op.ref, op.data)
        else batch.delete(op.ref)
      }
      fire(batch.commit())
    }
  }

  private wordRef(id: string) {
    return doc(this.col('words'), docId(id))
  }
  private cardRef(id: string) {
    return doc(this.col('cards'), docId(id))
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

  async getWords() {
    const snap = await getDocs(this.col('words'))
    return snap.docs.map((d) => d.data() as WordEntry)
  }

  async upsertWords(words: WordEntry[]) {
    await this.batchSet(words.map((w) => ({ ref: this.wordRef(w.id), data: w })))
  }

  async deleteWords(ids: string[]) {
    await this.batchDelete(ids.map((id) => this.wordRef(id)))
  }

  async saveWordBundle(input: WordBundleWrite) {
    await this.batchMixed(
      [
        ...(input.words ?? []).map((w) => ({ ref: this.wordRef(w.id), data: w })),
        ...(input.cards ?? []).map((c) => ({ ref: this.cardRef(c.id), data: c })),
      ],
      [...(input.deleteWordIds ?? []).map((id) => this.wordRef(id)), ...(input.deleteCardIds ?? []).map((id) => this.cardRef(id))],
    )
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

  /**
   * Deletes every document in USER_COLLECTIONS (+ meta/settings when `resetSettings`), ≤ 450 deletes per batch.
   * Like other writes, batches are applied to the local cache at once and not awaited (offline-safe);
   * the document lists are read first, so this needs the collections to be readable (online or cached).
   */
  async resetProgress(opts: ResetOptions = {}) {
    const snaps = await Promise.all(USER_COLLECTIONS.map((name) => getDocs(this.col(name))))
    const refs: DocumentReference[] = snaps.flatMap((s) => s.docs.map((d) => d.ref))
    if (opts.resetSettings) refs.push(this.settingsRef())
    for (let i = 0; i < refs.length; i += RESET_BATCH) {
      const batch = writeBatch(this.db)
      for (const ref of refs.slice(i, i + RESET_BATCH)) batch.delete(ref)
      fire(batch.commit())
    }
    if (!opts.resetSettings) {
      // lastDiagnosticAt is progress, not a preference: rewrite settings without it.
      const snap = await getDoc(this.settingsRef())
      const data = snap.exists() ? (snap.data() as Partial<Settings>) : undefined
      if (data && data.lastDiagnosticAt !== undefined) {
        const { lastDiagnosticAt: _drop, ...keep } = data
        fire(setDoc(this.settingsRef(), keep))
      }
    }
    clearDeviceProgress(opts)
    emitProgressReset()
  }

  async exportAll(): Promise<ExportBundle> {
    const [progress, cards, errors, settings, words] = await Promise.all([
      this.getAllProgress(),
      this.getCards(),
      this.getErrors(),
      this.getSettings(),
      this.getWords(),
    ])
    return { app: 'portugues-pt', version: 1, exportedAt: Date.now(), progress, cards, errors, settings, words }
  }

  async importAll(data: ExportBundle | string) {
    const b = parseExportBundle(data)
    await this.batchSet([
      ...b.progress.map((p) => ({ ref: doc(this.col('progress'), docId(p.topicId)), data: p })),
      ...b.cards.map((c) => ({ ref: doc(this.col('cards'), docId(c.id)), data: c })),
      ...b.errors.map((e) => ({ ref: doc(this.col('errors'), e.id), data: e })),
      ...b.words.map((w) => ({ ref: this.wordRef(w.id), data: w })),
      { ref: this.settingsRef(), data: b.settings },
    ])
  }
}
