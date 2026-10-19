/**
 * Local-first data store: the single in-memory source of truth for the signed-in user's data
 * (topic progress, SRS cards, error log, personal dictionary, settings).
 *
 *   first paint   ← device snapshot (localStorage, per uid) read synchronously in the constructor
 *   then          ← backend (Firestore listeners: cache first, then server; or localStorage in local mode)
 *   writes        → applied to memory at once (optimistic), persisted to the snapshot, then committed by the
 *                   backend; a rejected commit rolls the documents back and is reported via onWriteError.
 *
 * Conflict policy (merge by document id):
 *   - server wins: a remote document replaces the local one…
 *   - …except while a local write to that document is pending: the local value stays, the remote one is kept
 *     aside («shadow») and decides what happens when the write settles:
 *       ack     → local stays (it is what the server now has); for SRS cards the newer review wins
 *                 (fsrs.last_review, then updatedAt): a newer remote card is restored and re-committed;
 *       failure → the shadow (latest remote) or the value before the first pending write comes back.
 *   - a complete server listing (first server event of a listener) drops documents the server doesn't have,
 *     except pending ones. Cache-only listings never delete (an empty cache must not wipe the snapshot).
 *
 * Implements ProgressRepository, so existing write code keeps working; reads should use the hooks in
 * ./hooks.ts (synchronous, no per-mount fetch). Pure TS — no React, no Firebase (unit-tested in scripts/store.test.ts).
 */
import {
  DEFAULT_SETTINGS,
  applyResult,
  newId,
  parseExportBundle,
  type ErrorEntry,
  type ErrorEntryInput,
  type ExportBundle,
  type ImportResult,
  type ProgressRepository,
  type ResetOptions,
  type Settings,
  type SrsCard,
  type TopicProgress,
  type TopicResult,
  type WordBundleWrite,
  type WordEntry,
} from './types.ts'
import { REPAIR, repairCollection, warnOnce } from './validate.ts'

export const COLS = ['progress', 'cards', 'errors', 'words', 'meta'] as const
export type Col = (typeof COLS)[number]
/** Collections wiped by «Сбросить весь прогресс» (meta/settings is handled separately). */
export const PROGRESS_COLS = ['progress', 'cards', 'errors', 'words'] as const
export const SETTINGS_ID = 'settings'

interface DocOf {
  progress: TopicProgress
  cards: SrsCard
  errors: ErrorEntry
  words: WordEntry
  meta: Partial<Settings>
}
export type Docs = { readonly [C in Col]: Readonly<Record<string, DocOf[C]>> }

/** `data: null` = delete. */
export interface WriteOp {
  col: Col
  id: string
  data: object | null
}

export interface RemoteChange {
  id: string
  data: object | null
}
export interface RemoteBatch {
  col: Col
  changes: RemoteChange[]
  /** `changes` is the whole collection (documents not listed are gone). Only honoured with `fromServer`. */
  complete?: boolean
  /** Confirmed by the server (Firestore: `!metadata.fromCache`; local mode: always). */
  fromServer: boolean
}

export interface BackendSink {
  remote(batch: RemoteBatch): void
  /** Network state as seen by the backend. */
  online(online: boolean): void
  /** A listener failed (Firestore: permission-denied, unavailable…). */
  fail(error: unknown): void
}

export interface Backend {
  readonly kind: 'local' | 'firestore'
  /** Starts delivering remote data to `sink`; returns stop. Called once per attach. */
  connect(sink: BackendSink): () => void
  /** Commits ops in order. Resolves on server acknowledgement (never while offline — that's fine). */
  commit(ops: WriteOp[]): Promise<void>
  /** Forces a fresh round-trip (re-listen). */
  revalidate?(): void
  /** Every document id on the server (or cache when offline), for a complete «reset». */
  allIds?(): Promise<Partial<Record<Col, string[]>>>
}

export interface Persisted {
  v: 1
  savedAt: number
  lastSyncedAt: number | null
  docs: Docs
}
export interface SnapshotStorage {
  load(): Persisted | null
  save(p: Persisted): void
}

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline' | 'error'
export interface SyncState {
  status: SyncStatus
  /** Last moment every collection was confirmed by the server with nothing pending. */
  lastSyncedAt: number | null
  /** Local writes not yet acknowledged by the server. */
  pendingWrites: number
  /** 'permission-denied' or a message. */
  error: string | null
}

export interface WriteError {
  error: unknown
  ops: WriteOp[]
}

export interface DataStoreOptions {
  kind: 'local' | 'firestore'
  snapshot?: SnapshotStorage
  now?: () => number
  /** Debounce for snapshot saves (ms); 0 = save synchronously (tests). */
  saveDelayMs?: number
}

const EMPTY_DOCS: Docs = { progress: {}, cards: {}, errors: {}, words: {}, meta: {} }

/** Persisted documents with every collection and document shape-checked (broken ones dropped, logged once). */
export function repairDocs(raw: unknown, where: string): Docs {
  const d = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    progress: repairCollection('progress', d.progress, where),
    cards: repairCollection('cards', d.cards, where),
    errors: repairCollection('errors', d.errors, where),
    words: repairCollection('words', d.words, where),
    meta: repairCollection('meta', d.meta, where),
  }
}

const keyOf = (col: Col, id: string) => `${col}/${id}`

/** Structural equality for JSON-like data (key order independent). */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const bb = b as unknown[]
    return a.length === bb.length && a.every((x, i) => sameData(x, bb[i]))
  }
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined)
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined)
  if (ka.length !== kb.length) return false
  return ka.every((k) => sameData((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/** Newer SRS card state: by last review, then by updatedAt. */
export function newerCard(a: SrsCard, b: SrsCard): boolean {
  const ra = a.fsrs?.last_review ?? 0
  const rb = b.fsrs?.last_review ?? 0
  if (ra !== rb) return ra > rb
  return (a.updatedAt ?? 0) > (b.updatedAt ?? 0)
}

export class DataStore implements ProgressRepository {
  readonly kind: 'local' | 'firestore'
  private docs: Docs = EMPTY_DOCS
  private readonly listeners = new Set<() => void>()
  private readonly writeErrorListeners = new Set<(e: WriteError) => void>()
  private readonly readyWaiters = new Set<() => void>()
  /** key → number of in-flight writes. */
  private readonly pending = new Map<string, number>()
  /** key → value before the first in-flight write (rollback target). */
  private readonly base = new Map<string, object | null>()
  /** key → latest remote value seen while a write was in flight. */
  private readonly shadow = new Map<string, object | null>()
  private backend: Backend | null = null
  private stopBackend: (() => void) | null = null
  /** Writes made before a backend was attached (e.g. while auth is being confirmed). */
  private queue: { ops: WriteOp[]; done: (ok: boolean, e?: unknown) => void }[] = []
  private readonly snapshot?: SnapshotStorage
  private readonly now: () => number
  private readonly saveDelayMs: number
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private disposed = false

  private hydrated = false
  private forcedReady = false
  /** Was ready once: re-listening (revalidate / re-attach) never brings the skeletons back. */
  private wasReady = false
  /** Collections that delivered anything / were confirmed by the server since attach. */
  private readonly received = new Set<Col>()
  private readonly serverSynced = new Set<Col>()
  private online = true
  private errorMsg: string | null = null
  private lastSyncedAt: number | null = null
  private sync: SyncState
  private version = 0

  constructor(opts: DataStoreOptions) {
    this.kind = opts.kind
    this.snapshot = opts.snapshot
    this.now = opts.now ?? Date.now
    this.saveDelayMs = opts.saveDelayMs ?? 300
    const snap = this.snapshot?.load()
    if (snap) {
      // The snapshot is device storage: a broken collection / document must not crash every read (white screen).
      this.docs = repairDocs(snap.docs, 'snapshot')
      this.lastSyncedAt = typeof snap.lastSyncedAt === 'number' ? snap.lastSyncedAt : null
      this.hydrated = true
    }
    this.sync = this.computeSync()
  }

  // ── subscription ──────────────────────────────────────────────────────────────────────────

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }
  /** Changes on every update (for tests / debugging). */
  getVersion = () => this.version

  onWriteError(cb: (e: WriteError) => void): () => void {
    this.writeErrorListeners.add(cb)
    return () => {
      this.writeErrorListeners.delete(cb)
    }
  }

  private emit(): void {
    this.version++
    const next = this.computeSync()
    if (!sameData(next, this.sync)) this.sync = next
    if (this.isReady()) for (const w of [...this.readyWaiters]) w()
    for (const l of [...this.listeners]) l()
  }

  // ── backend lifecycle ─────────────────────────────────────────────────────────────────────

  /** Connects a backend (once auth is confirmed); flushes writes queued meanwhile. */
  attach(backend: Backend): void {
    if (this.disposed) return
    this.detach()
    this.backend = backend
    this.received.clear()
    this.serverSynced.clear()
    this.errorMsg = null
    this.stopBackend = backend.connect({
      remote: (b) => this.applyRemote(b),
      online: (on) => {
        if (this.online === on) return
        this.online = on
        if (!on) this.serverSynced.clear()
        this.emit()
      },
      fail: (e) => {
        this.errorMsg = isPermissionDenied(e) ? 'permission-denied' : e instanceof Error ? e.message : String(e)
        this.emit()
      },
    })
    const queued = this.queue
    this.queue = []
    for (const q of queued) {
      backend.commit(q.ops).then(
        () => q.done(true),
        (e: unknown) => q.done(false, e),
      )
    }
    this.emit()
  }

  detach(): void {
    this.stopBackend?.()
    this.stopBackend = null
    this.backend = null
  }

  /** Re-listen (visibility after a long pause, «retry» after an error). */
  revalidate(): void {
    if (!this.backend?.revalidate) return
    this.errorMsg = null
    this.serverSynced.clear()
    this.backend.revalidate()
    this.emit()
  }

  /** Stops the backend; with `persist: false` (sign-out) nothing is saved any more. */
  dispose({ persist = true }: { persist?: boolean } = {}): void {
    if (persist) this.flushSave()
    clearTimeout(this.saveTimer)
    this.detach()
    this.disposed = true
  }

  // ── readiness & sync state ────────────────────────────────────────────────────────────────

  /**
   * Data can be shown: from the device snapshot, or every collection has been confirmed by the server
   * (offline: delivered from the cache), or the boot timeout passed. Before that pages show skeletons.
   */
  isReady(): boolean {
    if (this.hydrated || this.forcedReady || this.wasReady) return true
    const ready = COLS.every((c) => this.serverSynced.has(c)) || (!this.online && COLS.every((c) => this.received.has(c)))
    if (ready) this.wasReady = true
    return ready
  }
  /** Show whatever is known (boot timeout). */
  markReady(): void {
    if (this.isReady()) return
    this.forcedReady = true
    this.emit()
  }
  whenReady(timeoutMs = 10_000): Promise<void> {
    if (this.isReady()) return Promise.resolve()
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(t)
        this.readyWaiters.delete(done)
        resolve()
      }
      const t = setTimeout(done, timeoutMs)
      this.readyWaiters.add(done)
    })
  }

  getSync = (): SyncState => this.sync

  private pendingCount(): number {
    let n = 0
    for (const v of this.pending.values()) n += v
    return n
  }

  private computeSync(): SyncState {
    const pendingWrites = this.pendingCount()
    const base = { lastSyncedAt: this.lastSyncedAt, pendingWrites, error: this.errorMsg }
    if (this.kind === 'local') return { ...base, status: 'local' }
    if (this.errorMsg) return { ...base, status: 'error' }
    if (!this.online) return { ...base, status: 'offline' }
    if (!this.backend || pendingWrites > 0 || !COLS.every((c) => this.serverSynced.has(c))) return { ...base, status: 'syncing' }
    return { ...base, status: 'synced' }
  }

  private noteSynced(): void {
    if (this.kind === 'firestore' && this.online && this.pendingCount() === 0 && COLS.every((c) => this.serverSynced.has(c))) {
      this.lastSyncedAt = this.now()
    }
  }

  // ── remote merge ──────────────────────────────────────────────────────────────────────────

  private applyRemote(b: RemoteBatch): void {
    const cur = this.docs[b.col] as Record<string, object>
    let next: Record<string, object> | null = null
    const put = (id: string, data: object | null) => {
      next ??= { ...cur }
      if (data === null) delete next[id]
      else next[id] = data
    }
    const seen = b.complete && b.fromServer ? new Set<string>() : null
    const repair = REPAIR[b.col] as (x: unknown, id?: string) => object | null
    let broken = 0
    for (const raw of b.changes) {
      seen?.add(raw.id)
      // A malformed remote document (older app version, manual edit) is treated as absent instead of crashing pages.
      const fixed = raw.data === null ? null : repair(raw.data, raw.id)
      if (raw.data !== null && !fixed) broken++
      const ch = { id: raw.id, data: fixed }
      const key = keyOf(b.col, ch.id)
      if (this.pending.has(key)) {
        this.shadow.set(key, ch.data)
        continue
      }
      const old = cur[ch.id]
      if (ch.data === null) {
        if (old !== undefined) put(ch.id, null)
      } else if (old === undefined || !sameData(old, ch.data)) {
        put(ch.id, ch.data)
      }
    }
    if (seen) {
      for (const id of Object.keys(cur)) {
        if (!seen.has(id) && !this.pending.has(keyOf(b.col, id))) put(id, null)
      }
    }
    if (broken) warnOnce(this.kind, b.col, `${broken} document(s)`)
    this.received.add(b.col)
    if (b.fromServer) this.serverSynced.add(b.col)
    else if (!this.online) this.serverSynced.delete(b.col)
    if (next) this.docs = { ...this.docs, [b.col]: next }
    this.noteSynced()
    if (next || b.fromServer) this.scheduleSave()
    this.emit()
  }

  // ── local writes ──────────────────────────────────────────────────────────────────────────

  private setLocal(ops: WriteOp[]): void {
    const changed: Partial<Record<Col, Record<string, object>>> = {}
    for (const op of ops) {
      const m = (changed[op.col] ??= { ...(this.docs[op.col] as Record<string, object>) })
      if (op.data === null) delete m[op.id]
      else m[op.id] = op.data
    }
    this.docs = { ...this.docs, ...changed } as Docs
  }

  private current(col: Col, id: string): object | null {
    return ((this.docs[col] as Record<string, object>)[id] as object | undefined) ?? null
  }

  /**
   * Optimistic write: memory + snapshot now, backend commit after. Local mode returns the commit itself
   * (synchronous storage, a quota error reaches the caller); Firestore resolves at once — offline commits
   * only resolve when the server acknowledges, and the SDK queues them durably meanwhile.
   */
  write(ops: WriteOp[]): Promise<void> {
    if (!ops.length) return Promise.resolve()
    for (const op of ops) {
      const key = keyOf(op.col, op.id)
      const n = this.pending.get(key) ?? 0
      if (n === 0) this.base.set(key, this.current(op.col, op.id))
      this.pending.set(key, n + 1)
    }
    this.setLocal(ops)
    this.scheduleSave()
    this.emit()

    const settled = new Promise<void>((resolve, reject) => {
      const done = (ok: boolean, e?: unknown) => {
        if (ok) this.onAck(ops)
        else this.onFail(ops, e)
        if (ok) resolve()
        else reject(e)
      }
      if (this.backend) {
        this.backend.commit(ops).then(
          () => done(true),
          (e: unknown) => done(false, e),
        )
      } else {
        this.queue.push({ ops, done })
      }
    })
    if (this.kind === 'local') return settled
    settled.catch(() => {}) // reported via onWriteError
    return Promise.resolve()
  }

  private release(key: string): boolean {
    const n = (this.pending.get(key) ?? 1) - 1
    if (n > 0) {
      this.pending.set(key, n)
      return false
    }
    this.pending.delete(key)
    return true
  }

  private onAck(ops: WriteOp[]): void {
    if (this.disposed) return
    const restore: WriteOp[] = []
    for (const op of ops) {
      const key = keyOf(op.col, op.id)
      if (!this.release(key)) continue
      const sh = this.shadow.get(key)
      this.shadow.delete(key)
      this.base.delete(key)
      // SRS cards: the newer review wins even against our acknowledged write.
      if (op.col === 'cards' && sh && op.data && newerCard(sh as SrsCard, op.data as SrsCard)) {
        restore.push({ col: 'cards', id: op.id, data: sh })
      }
    }
    this.noteSynced()
    if (restore.length) void this.write(restore)
    else this.emit()
  }

  private onFail(ops: WriteOp[], error: unknown): void {
    if (this.disposed) return
    const rollback: WriteOp[] = []
    for (const op of ops) {
      const key = keyOf(op.col, op.id)
      if (!this.release(key)) continue // a later write to the same doc is still in flight
      const target = this.shadow.has(key) ? this.shadow.get(key)! : (this.base.get(key) ?? null)
      this.shadow.delete(key)
      this.base.delete(key)
      rollback.push({ col: op.col, id: op.id, data: target })
    }
    if (rollback.length) {
      this.setLocal(rollback)
      this.scheduleSave()
    }
    if (isPermissionDenied(error)) this.errorMsg = 'permission-denied'
    this.emit()
    for (const l of [...this.writeErrorListeners]) l({ error, ops })
  }

  // ── snapshot ──────────────────────────────────────────────────────────────────────────────

  private scheduleSave(): void {
    if (!this.snapshot || this.disposed) return
    if (this.saveDelayMs <= 0) {
      this.flushSave()
      return
    }
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flushSave(), this.saveDelayMs)
  }

  /** Writes the device snapshot now (also on pagehide). */
  flushSave(): void {
    clearTimeout(this.saveTimer)
    this.saveTimer = undefined
    if (!this.snapshot || this.disposed) return
    this.snapshot.save({ v: 1, savedAt: this.now(), lastSyncedAt: this.lastSyncedAt, docs: this.docs })
  }

  // ── derived views (memoized per collection object: stable for useSyncExternalStore) ───────

  private memo = new Map<string, { src: unknown; value: unknown }>()
  private derive<T>(name: string, src: unknown, make: () => T): T {
    const hit = this.memo.get(name)
    if (hit && hit.src === src) return hit.value as T
    const value = make()
    this.memo.set(name, { src, value })
    return value
  }

  progressMap = (): Map<string, TopicProgress> =>
    this.derive('progressMap', this.docs.progress, () => new Map(Object.entries(this.docs.progress)))
  progressList = (): TopicProgress[] => this.derive('progressList', this.docs.progress, () => Object.values(this.docs.progress))
  cardList = (): SrsCard[] => this.derive('cardList', this.docs.cards, () => Object.values(this.docs.cards))
  /** Newest first. */
  errorList = (): ErrorEntry[] =>
    this.derive('errorList', this.docs.errors, () => Object.values(this.docs.errors).sort((a, b) => b.at - a.at))
  wordList = (): WordEntry[] => this.derive('wordList', this.docs.words, () => Object.values(this.docs.words))
  settings = (): Settings =>
    this.derive('settings', this.docs.meta, () => ({ ...DEFAULT_SETTINGS, ...(this.docs.meta[SETTINGS_ID] ?? {}) }))
  /** Raw documents (tests, export). */
  getDocs = (): Docs => this.docs

  // ── ProgressRepository ────────────────────────────────────────────────────────────────────

  async getTopicProgress(topicId: string) {
    return this.docs.progress[topicId]
  }

  async saveTopicResult(result: TopicResult) {
    await this.whenReady() // never aggregate on top of «not loaded yet»
    const next = applyResult(this.docs.progress[result.topicId], result)
    await this.write([{ col: 'progress', id: result.topicId, data: next }])
    return next
  }

  async getAllProgress() {
    return this.progressList()
  }

  async getCards() {
    return this.cardList()
  }

  async upsertCards(cards: SrsCard[]) {
    await this.write(cards.map((c) => ({ col: 'cards' as const, id: c.id, data: c })))
  }

  async deleteCards(ids: string[]) {
    await this.write(ids.filter((id) => id in this.docs.cards).map((id) => ({ col: 'cards' as const, id, data: null })))
  }

  async logError(entry: ErrorEntryInput) {
    const e: ErrorEntry = { ...entry, id: newId() }
    await this.write([{ col: 'errors', id: e.id, data: e }])
    return e
  }

  async getErrors() {
    return this.errorList()
  }

  async getSettings(): Promise<Settings> {
    return this.settings()
  }

  async saveSettings(patch: Partial<Settings>) {
    await this.whenReady() // the whole document is written: don't overwrite server settings with defaults
    const next = { ...this.settings(), ...patch }
    await this.write([{ col: 'meta', id: SETTINGS_ID, data: next }])
    return next
  }

  async getWords() {
    return this.wordList()
  }

  async upsertWords(words: WordEntry[]) {
    await this.write(words.map((w) => ({ col: 'words' as const, id: w.id, data: w })))
  }

  async deleteWords(ids: string[]) {
    await this.write(ids.filter((id) => id in this.docs.words).map((id) => ({ col: 'words' as const, id, data: null })))
  }

  /** Sets, then deletes — one commit (Firestore: one atomic batch when ≤ 450 ops). */
  async saveWordBundle(input: WordBundleWrite) {
    await this.write([
      ...(input.words ?? []).map((w) => ({ col: 'words' as const, id: w.id, data: w })),
      ...(input.cards ?? []).map((c) => ({ col: 'cards' as const, id: c.id, data: c })),
      ...(input.deleteWordIds ?? []).map((id) => ({ col: 'words' as const, id, data: null })),
      ...(input.deleteCardIds ?? []).map((id) => ({ col: 'cards' as const, id, data: null })),
    ])
  }

  /**
   * Deletes every progress document known here or on the server (`backend.allIds`), keeps settings
   * (minus `lastDiagnosticAt`) unless `resetSettings`. Device keys are cleared by the caller-independent
   * `afterReset` hook (see RepositoryProvider: clearDeviceProgress + emitProgressReset).
   */
  async resetProgress(opts: ResetOptions = {}) {
    const ids: Record<string, Set<string>> = {}
    for (const c of PROGRESS_COLS) ids[c] = new Set(Object.keys(this.docs[c]))
    const remote = await this.backend?.allIds?.().catch(() => undefined)
    for (const c of PROGRESS_COLS) for (const id of remote?.[c] ?? []) ids[c].add(id)
    const ops: WriteOp[] = PROGRESS_COLS.flatMap((c) => [...ids[c]].map((id) => ({ col: c, id, data: null })))
    const settingsDoc = this.docs.meta[SETTINGS_ID]
    if (opts.resetSettings) {
      ops.push({ col: 'meta', id: SETTINGS_ID, data: null })
    } else if (settingsDoc && settingsDoc.lastDiagnosticAt !== undefined) {
      // lastDiagnosticAt is progress, not a preference.
      const { lastDiagnosticAt: _drop, ...keep } = settingsDoc
      ops.push({ col: 'meta', id: SETTINGS_ID, data: keep })
    }
    await this.write(ops)
    this.afterReset?.(opts)
  }
  /** Device-side cleanup after a reset (set by the provider; kept out of this pure module). */
  afterReset?: (opts: ResetOptions) => void

  async exportAll(): Promise<ExportBundle> {
    return {
      app: 'portugues-pt',
      version: 1,
      exportedAt: this.now(),
      progress: this.progressList(),
      cards: this.cardList(),
      errors: this.errorList(),
      settings: this.settings(),
      words: this.wordList(),
    }
  }

  /** Merges by id (incoming wins; SRS cards: the newer review wins on the server); settings are replaced. */
  async importAll(data: ExportBundle | string): Promise<ImportResult> {
    const b = parseExportBundle(data)
    await this.write([
      ...b.progress.map((p) => ({ col: 'progress' as const, id: p.topicId, data: p })),
      ...b.cards.map((c) => ({ col: 'cards' as const, id: c.id, data: c })),
      ...b.errors.map((e) => ({ col: 'errors' as const, id: e.id, data: e })),
      ...b.words.map((w) => ({ col: 'words' as const, id: w.id, data: w })),
      { col: 'meta', id: SETTINGS_ID, data: b.settings },
    ])
    return { skipped: b.skipped }
  }
}

export function isPermissionDenied(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'permission-denied'
}
