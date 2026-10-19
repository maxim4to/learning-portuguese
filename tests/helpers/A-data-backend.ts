/**
 * Controllable DataStore backend for node unit tests (stream A, data). Same idea as the FakeBackend in
 * scripts/store.test.ts: commits wait until ack()/fail(); remote data is pushed by the test.
 */
import { COLS, type Backend, type BackendSink, type Col, type WriteOp } from '@/data/store'

export const tick = () => new Promise<void>((r) => setTimeout(r, 0))

export class FakeBackend implements Backend {
  readonly kind = 'firestore' as const
  sink: BackendSink | null = null
  connects = 0
  stops = 0
  commits: { ops: WriteOp[]; resolve(): void; reject(e: unknown): void }[] = []
  revalidations = 0
  serverIds: Partial<Record<Col, string[]>> = {}
  allIdsError: unknown = null

  connect(sink: BackendSink) {
    this.sink = sink
    this.connects++
    return () => {
      this.stops++
      this.sink = null
    }
  }
  commit(ops: WriteOp[]) {
    return new Promise<void>((resolve, reject) => this.commits.push({ ops, resolve, reject }))
  }
  revalidate() {
    this.revalidations++
  }
  async allIds() {
    if (this.allIdsError) throw this.allIdsError
    return this.serverIds
  }
  /** Server-confirmed full listing of every collection. */
  serverAll(data: Partial<Record<Col, Record<string, object>>> = {}) {
    for (const col of COLS) {
      const docs = data[col] ?? {}
      this.sink!.remote({ col, complete: true, fromServer: true, changes: Object.entries(docs).map(([id, d]) => ({ id, data: d })) })
    }
  }
  /** Cache-only delivery of every collection (offline first open). */
  cacheAll(data: Partial<Record<Col, Record<string, object>>> = {}) {
    for (const col of COLS) {
      const docs = data[col] ?? {}
      this.sink!.remote({ col, complete: true, fromServer: false, changes: Object.entries(docs).map(([id, d]) => ({ id, data: d })) })
    }
  }
  async ack(i = 0) {
    this.commits.splice(i, 1)[0].resolve()
    await tick()
  }
  async fail(e: unknown, i = 0) {
    this.commits.splice(i, 1)[0].reject(e)
    await tick()
  }
}

/** Backend without the optional revalidate/allIds (local-like, auto-acknowledging). */
export class MinimalBackend implements Backend {
  readonly kind = 'local' as const
  committed: WriteOp[][] = []
  connect() {
    return () => {}
  }
  async commit(ops: WriteOp[]) {
    this.committed.push(ops)
  }
}
