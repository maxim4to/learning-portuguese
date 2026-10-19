/**
 * Local-mode backend for the DataStore: the same localStorage layout as LocalRepository
 * (ptpt:v1:progress / cards / words as id maps, errors as an array, settings as an object), so existing
 * local data keeps working. Delivers everything synchronously on connect (first render has the data) and
 * follows other tabs through the `storage` event. Stored data is shape-checked on read (src/data/validate.ts):
 * a value of the wrong shape counts as empty, a broken document is dropped — the app always starts.
 */
import { LOCAL_SETTINGS_KEY } from './deviceProgress.ts'
import { COLS, SETTINGS_ID, type Backend, type BackendSink, type Col, type RemoteChange, type WriteOp } from './store.ts'
import type { ErrorEntry } from './types.ts'
import { repairCollection, repairError, repairList, warnOnce } from './validate.ts'

const PREFIX = 'ptpt:v1:'
const KEYS: Record<Col, string> = {
  progress: PREFIX + 'progress',
  cards: PREFIX + 'cards',
  errors: PREFIX + 'errors',
  words: PREFIX + 'words',
  meta: LOCAL_SETTINGS_KEY,
}
/** LocalRepository kept the newest 2000 errors. */
const MAX_ERRORS = 2000

function read(key: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    return raw ? (JSON.parse(raw) as unknown) : undefined
  } catch {
    warnOnce('local', key, 'invalid JSON')
    return undefined
  }
}

/** The collection as an id → document map (shape-checked). */
function readCol(col: Col): Record<string, object> {
  const raw = read(KEYS[col])
  if (col === 'errors') {
    // Stored as an array; anything else is treated as empty.
    if (raw !== undefined && !Array.isArray(raw)) warnOnce('local', col, raw)
    const { ok, skipped } = repairList(Array.isArray(raw) ? raw : [], (x) => repairError(x))
    if (skipped) warnOnce('local', col, `${skipped} document(s)`)
    return Object.fromEntries(ok.map((e) => [e.id, e]))
  }
  if (col === 'meta') return raw === undefined || raw === null ? {} : repairCollection('meta', { [SETTINGS_ID]: raw }, 'local')
  return repairCollection(col, raw ?? undefined, 'local')
}

/** The new raw value of a collection's key (null = remove the key). */
function serialize(col: Col, docs: Record<string, object>): string | null {
  if (col === 'errors') {
    const list = (Object.values(docs) as ErrorEntry[]).sort((a, b) => a.at - b.at).slice(-MAX_ERRORS)
    return JSON.stringify(list)
  }
  if (col === 'meta') {
    const s = docs[SETTINGS_ID]
    return s ? JSON.stringify(s) : null
  }
  return Object.keys(docs).length === 0 ? null : JSON.stringify(docs)
}

export class LocalBackend implements Backend {
  readonly kind = 'local' as const

  connect(sink: BackendSink): () => void {
    const emit = (cols: readonly Col[]) => {
      for (const col of cols) {
        const docs = readCol(col)
        const changes: RemoteChange[] = Object.entries(docs).map(([id, data]) => ({ id, data }))
        sink.remote({ col, changes, complete: true, fromServer: true })
      }
    }
    emit(COLS)
    const onStorage = (e: { key: string | null; storageArea: unknown }) => {
      if (e.storageArea && e.storageArea !== globalThis.localStorage) return
      if (e.key === null) emit(COLS)
      else {
        const col = COLS.find((c) => KEYS[c] === e.key)
        if (col) emit([col])
      }
    }
    // Typed structurally: this module is also type-checked without DOM libs (node tests).
    type Listen = (type: 'storage', fn: typeof onStorage) => void
    const target = globalThis as unknown as { addEventListener?: Listen; removeEventListener?: Listen }
    target.addEventListener?.('storage', onStorage)
    return () => target.removeEventListener?.('storage', onStorage)
  }

  async commit(ops: WriteOp[]): Promise<void> {
    const touched = new Map<Col, Record<string, object>>()
    for (const op of ops) {
      let docs = touched.get(op.col)
      if (!docs) touched.set(op.col, (docs = readCol(op.col)))
      if (op.data === null) delete docs[op.id]
      else docs[op.id] = op.data
    }
    // All or nothing: when a later key hits the quota, the keys already written get their old values back
    // (the store rolls the whole commit back in memory, so storage must match).
    const ls = globalThis.localStorage
    const written: [key: string, old: string | null][] = []
    try {
      for (const [col, docs] of touched) {
        const key = KEYS[col]
        const old = ls.getItem(key)
        const next = serialize(col, docs)
        if (next === old) continue
        written.push([key, old])
        if (next === null) ls.removeItem(key)
        else ls.setItem(key, next)
      }
    } catch (e) {
      for (const [key, old] of written.reverse()) {
        try {
          if (old === null) ls.removeItem(key)
          else ls.setItem(key, old)
        } catch {
          // restoring an old (already stored) value can hardly fail; nothing more to do
        }
      }
      throw e
    }
  }
}
