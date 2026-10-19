/**
 * Local-mode backend for the DataStore: the same localStorage layout as LocalRepository
 * (ptpt:v1:progress / cards / words as id maps, errors as an array, settings as an object), so existing
 * local data keeps working. Delivers everything synchronously on connect (first render has the data) and
 * follows other tabs through the `storage` event.
 */
import { LOCAL_SETTINGS_KEY } from './deviceProgress.ts'
import { COLS, SETTINGS_ID, type Backend, type BackendSink, type Col, type RemoteChange, type WriteOp } from './store.ts'
import type { ErrorEntry } from './types.ts'

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

function read<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/** The collection as an id → document map. */
function readCol(col: Col): Record<string, object> {
  if (col === 'errors') return Object.fromEntries(read<ErrorEntry[]>(KEYS.errors, []).map((e) => [e.id, e]))
  if (col === 'meta') {
    const s = read<object | null>(KEYS.meta, null)
    return s ? { [SETTINGS_ID]: s } : {}
  }
  return read<Record<string, object>>(KEYS[col], {})
}

function writeCol(col: Col, docs: Record<string, object>): void {
  const ls = globalThis.localStorage
  if (col === 'errors') {
    const list = (Object.values(docs) as ErrorEntry[]).sort((a, b) => a.at - b.at).slice(-MAX_ERRORS)
    ls.setItem(KEYS.errors, JSON.stringify(list))
  } else if (col === 'meta') {
    const s = docs[SETTINGS_ID]
    if (s) ls.setItem(KEYS.meta, JSON.stringify(s))
    else ls.removeItem(KEYS.meta)
  } else if (Object.keys(docs).length === 0) {
    ls.removeItem(KEYS[col])
  } else {
    ls.setItem(KEYS[col], JSON.stringify(docs))
  }
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
    for (const [col, docs] of touched) writeCol(col, docs)
  }
}
