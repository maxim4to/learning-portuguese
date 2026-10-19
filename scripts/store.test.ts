/**
 * Local-first DataStore (src/data/store.ts): snapshot hydration, revalidation merge, optimistic writes with
 * rollback, conflict policy, per-uid snapshot isolation, reset/export/import, local backend.
 *   npx vitest run scripts/store.test.ts
 */
import { beforeEach, describe, test } from 'vitest'
import assert from 'node:assert/strict'

class MemoryStorage implements Storage {
  private m = new Map<string, string>()
  get length() {
    return this.m.size
  }
  clear() {
    this.m.clear()
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
}
const g = globalThis as unknown as { localStorage: Storage; sessionStorage: Storage }
g.localStorage = new MemoryStorage()
g.sessionStorage = new MemoryStorage()

const { DataStore, newerCard } = await import('../src/data/store.ts')
const { snapshotStorage, forgetUser, hasSnapshot, SNAP_PREFIX } = await import('../src/data/snapshot.ts')
const { LocalBackend } = await import('../src/data/localBackend.ts')
const { clearDeviceProgress } = await import('../src/data/deviceProgress.ts')
type Backend = import('../src/data/store.ts').Backend
type BackendSink = import('../src/data/store.ts').BackendSink
type WriteOp = import('../src/data/store.ts').WriteOp
type SrsCard = import('../src/data/types.ts').SrsCard
type TopicProgress = import('../src/data/types.ts').TopicProgress

const tick = () => new Promise((r) => setTimeout(r, 0))

/** Controllable backend: commits wait until ack()/fail(); remote data is pushed by the test. */
class FakeBackend implements Backend {
  readonly kind = 'firestore' as const
  sink: BackendSink | null = null
  commits: { ops: WriteOp[]; resolve(): void; reject(e: unknown): void }[] = []
  revalidations = 0
  serverIds: Record<string, string[]> = {}
  connect(sink: BackendSink) {
    this.sink = sink
    return () => {
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
    return this.serverIds
  }
  /** Server-confirmed full listing of every collection. */
  serverAll(data: Partial<Record<string, Record<string, object>>>) {
    for (const col of ['progress', 'cards', 'errors', 'words', 'meta'] as const) {
      const docs = data[col] ?? {}
      this.sink!.remote({ col, complete: true, fromServer: true, changes: Object.entries(docs).map(([id, d]) => ({ id, data: d })) })
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

const prog = (topicId: string, pct: number, at = 1000): TopicProgress => ({
  topicId,
  status: pct < 0.6 ? 'weak' : pct < 0.85 ? 'learning' : 'confident',
  attempts: 1,
  lastPct: pct,
  bestPct: pct,
  lastAt: at,
  history: [{ topicId, correct: Math.round(pct * 10), total: 10, at }],
})
const card = (id: string, lastReview: number, updatedAt = lastReview): SrsCard => ({
  id,
  kind: 'error',
  front: 'f',
  back: 'b',
  fsrs: { due: lastReview + 1000, stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 1, lapses: 0, state: 2, last_review: lastReview },
  createdAt: 1,
  updatedAt,
})

const newStore = (uid = 'u1', backend?: Backend) => {
  const s = new DataStore({ kind: 'firestore', snapshot: snapshotStorage(uid), saveDelayMs: 0 })
  if (backend) s.attach(backend)
  return s
}

beforeEach(() => {
  g.localStorage.clear()
  g.sessionStorage.clear()
})

describe('hydration from the device snapshot', () => {
  test('a new store starts from the snapshot synchronously and is ready before any network', () => {
    assert.equal(newStore('u1', new FakeBackend()).isReady(), false) // no snapshot, no server yet
    const be = new FakeBackend()
    const s1 = newStore('u1', be)
    be.serverAll({ progress: { t1: prog('t1', 0.9) }, cards: { c1: card('c1', 10) } })
    assert.equal(s1.isReady(), true)
    s1.flushSave()

    const s2 = newStore('u1') // reload: no backend attached yet
    assert.equal(s2.isReady(), true)
    assert.equal(s2.progressMap().get('t1')?.status, 'confident')
    assert.equal(s2.cardList().length, 1)
  })

  test('without a snapshot: not ready until every collection is confirmed by the server', () => {
    const be = new FakeBackend()
    const s = newStore('u1', be)
    be.sink!.remote({ col: 'progress', changes: [], fromServer: false })
    assert.equal(s.isReady(), false)
    be.serverAll({})
    assert.equal(s.isReady(), true)
  })

  test('offline first open: ready once every collection came from the cache', () => {
    const be = new FakeBackend()
    const s = newStore('u1', be)
    be.sink!.online(false)
    for (const col of ['progress', 'cards', 'errors', 'words', 'meta'] as const) be.sink!.remote({ col, changes: [], fromServer: false })
    assert.equal(s.isReady(), true)
    assert.equal(s.getSync().status, 'offline')
  })

  test('derived views keep their identity between unrelated updates', () => {
    const be = new FakeBackend()
    const s = newStore('u1', be)
    be.serverAll({ progress: { t1: prog('t1', 0.9) }, cards: { c1: card('c1', 10) } })
    const m = s.progressMap()
    void s.upsertCards([card('c2', 20)])
    assert.equal(s.progressMap(), m)
    assert.notEqual(s.cardList().length, 1)
  })
})

describe('revalidation merge', () => {
  test('server wins over the snapshot; a complete server listing drops deleted documents', () => {
    const be = new FakeBackend()
    const s1 = newStore('u1', be)
    be.serverAll({ progress: { t1: prog('t1', 0.9), t2: prog('t2', 0.5) } })
    s1.flushSave()

    const be2 = new FakeBackend()
    const s2 = newStore('u1', be2)
    assert.equal(s2.progressMap().size, 2)
    // cache first: an empty cache must not wipe the snapshot
    be2.sink!.remote({ col: 'progress', changes: [], complete: true, fromServer: false })
    assert.equal(s2.progressMap().size, 2)
    // then the server: t1 changed on another device, t2 deleted there
    be2.sink!.remote({ col: 'progress', complete: true, fromServer: true, changes: [{ id: 't1', data: prog('t1', 0.7) }] })
    assert.equal(s2.progressMap().get('t1')?.status, 'learning')
    assert.equal(s2.progressMap().has('t2'), false)
  })

  test('an identical remote document keeps the object (no re-render)', () => {
    const be = new FakeBackend()
    const s = newStore('u1', be)
    be.serverAll({ progress: { t1: prog('t1', 0.9) } })
    const before = s.progressMap()
    const v = s.getVersion()
    be.sink!.remote({ col: 'progress', changes: [{ id: 't1', data: JSON.parse(JSON.stringify(prog('t1', 0.9))) }], fromServer: true })
    assert.equal(s.progressMap(), before)
    assert.ok(s.getVersion() > v) // listeners were notified, the selected slice is unchanged
  })

  test('sync status: syncing → synced (with lastSyncedAt) → offline', () => {
    const be = new FakeBackend()
    const s = newStore('u1', be)
    assert.equal(s.getSync().status, 'syncing')
    be.serverAll({})
    assert.equal(s.getSync().status, 'synced')
    assert.ok(s.getSync().lastSyncedAt)
    be.sink!.online(false)
    assert.equal(s.getSync().status, 'offline')
  })

  test('revalidate() re-listens and goes back to «syncing» until the server confirms', () => {
    const be = new FakeBackend()
    const s = newStore('u1', be)
    be.serverAll({})
    s.revalidate()
    assert.equal(be.revalidations, 1)
    assert.equal(s.getSync().status, 'syncing')
    be.serverAll({})
    assert.equal(s.getSync().status, 'synced')
  })
})

describe('optimistic writes', () => {
  test('a write shows at once and is persisted to the snapshot before the server acks', async () => {
    const be = new FakeBackend()
    const s = newStore('u1', be)
    be.serverAll({})
    const p = await s.saveTopicResult({ topicId: 't1', correct: 9, total: 10, at: 5 })
    assert.equal(p.status, 'confident')
    assert.equal(s.progressMap().get('t1')?.status, 'confident')
    assert.equal(s.getSync().pendingWrites, 1)
    assert.equal(s.getSync().status, 'syncing')
    assert.equal(newStore('u1').progressMap().get('t1')?.status, 'confident') // snapshot
    await be.ack()
    assert.equal(s.getSync().pendingWrites, 0)
    assert.equal(s.getSync().status, 'synced')
  })

  test('a rejected write rolls back and is reported', async () => {
    const be = new FakeBackend()
    const s = newStore('u1', be)
    be.serverAll({ cards: { c1: card('c1', 10) } })
    const errors: unknown[] = []
    s.onWriteError((e) => errors.push(e.error))
    await s.upsertCards([card('c1', 20)])
    await s.deleteCards(['c1']) // second in-flight write to the same doc
    assert.equal(s.cardList().length, 0)
    await be.fail(new Error('boom'), 0)
    assert.equal(s.cardList().length, 0, 'a later write is still in flight: keep its value')
    await be.fail(new Error('boom'), 0)
    assert.equal(s.cardList()[0]?.fsrs.last_review, 10, 'back to the value before the first write')
    assert.equal(errors.length, 2)
  })

  test('pending local writes win over remote data until they settle; then the server wins', async () => {
    const be = new FakeBackend()
    const s = newStore('u1', be)
    be.serverAll({ progress: { t1: prog('t1', 0.5) } })
    await s.saveTopicResult({ topicId: 't1', correct: 9, total: 10, at: 5 })
    be.sink!.remote({ col: 'progress', changes: [{ id: 't1', data: prog('t1', 0.3) }], fromServer: true })
    assert.equal(s.progressMap().get('t1')?.lastPct, 0.9)
    // a complete listing without t1 doesn't delete the pending doc either
    be.sink!.remote({ col: 'progress', changes: [], complete: true, fromServer: true })
    assert.equal(s.progressMap().get('t1')?.lastPct, 0.9)
    await be.ack()
    be.sink!.remote({ col: 'progress', changes: [{ id: 't1', data: prog('t1', 0.6) }], fromServer: true })
    assert.equal(s.progressMap().get('t1')?.lastPct, 0.6)
  })

  test('a failed write falls back to the latest remote value seen meanwhile', async () => {
    const be = new FakeBackend()
    const s = newStore('u1', be)
    be.serverAll({ progress: { t1: prog('t1', 0.5) } })
    await s.saveTopicResult({ topicId: 't1', correct: 9, total: 10, at: 5 })
    be.sink!.remote({ col: 'progress', changes: [{ id: 't1', data: prog('t1', 0.7) }], fromServer: true })
    await be.fail(new Error('x'))
    assert.equal(s.progressMap().get('t1')?.lastPct, 0.7)
  })

  test('SRS cards: the newer review wins even over an acknowledged local write', async () => {
    assert.equal(newerCard(card('c', 20), card('c', 10)), true)
    assert.equal(newerCard(card('c', 10, 30), card('c', 10, 20)), true)
    const be = new FakeBackend()
    const s = newStore('u1', be)
    be.serverAll({ cards: { c1: card('c1', 10) } })
    await s.upsertCards([card('c1', 20)]) // reviewed here (offline, pending)
    be.sink!.remote({ col: 'cards', changes: [{ id: 'c1', data: card('c1', 30) }], fromServer: true }) // reviewed later elsewhere
    assert.equal(s.cardList()[0].fsrs.last_review, 20)
    await be.ack()
    assert.equal(s.cardList()[0].fsrs.last_review, 30, 'newer remote review restored')
    assert.equal(be.commits.length, 1, 'and written back to the server')
    assert.equal((be.commits[0].ops[0].data as SrsCard).fsrs.last_review, 30)
  })

  test('writes before the backend is attached are queued and committed on attach', async () => {
    const s = newStore('u1')
    await s.logError({ exerciseId: 'e', topicId: 't', given: 'a', expected: 'b', at: 1 })
    assert.equal(s.errorList().length, 1)
    assert.equal(s.getSync().pendingWrites, 1)
    const be = new FakeBackend()
    s.attach(be)
    assert.equal(be.commits.length, 1)
    await be.ack()
    assert.equal(s.getSync().pendingWrites, 0)
  })

  test('saveSettings merges with known settings', async () => {
    const be = new FakeBackend()
    const s = newStore('u1', be)
    be.serverAll({ meta: { settings: { rate: 1.25 } } })
    await s.saveSettings({ voice: 'male' })
    assert.equal(s.settings().rate, 1.25)
    assert.equal(s.settings().voice, 'male')
    assert.equal(s.settings().newCardsPerDay, 15) // default
  })
})

describe('per-uid isolation, sign-out, reset, export/import', () => {
  test('each uid has its own snapshot', () => {
    const a = newStore('alice', new FakeBackend())
    void a.upsertCards([card('a1', 1)])
    const b = newStore('bob', new FakeBackend())
    void b.upsertCards([card('b1', 1), card('b2', 1)])
    assert.deepEqual(newStore('alice').cardList().map((c) => c.id), ['a1'])
    assert.deepEqual(newStore('bob').cardList().map((c) => c.id).sort(), ['b1', 'b2'])
  })

  test('sign-out forgets that uid only, and the live store cannot re-save it', () => {
    const a = newStore('alice', new FakeBackend())
    void a.upsertCards([card('a1', 1)])
    const b = newStore('bob', new FakeBackend())
    void b.upsertCards([card('b1', 1)])
    forgetUser('alice')
    void a.upsertCards([card('a2', 1)])
    a.flushSave()
    assert.equal(hasSnapshot('alice'), false)
    assert.equal(hasSnapshot('bob'), true)
  })

  test('a progress reset (device sweep) keeps the snapshots of every uid', () => {
    newStore('alice', new FakeBackend()).flushSave()
    g.localStorage.setItem('ptpt:v1:srs-new:2026-01-01', '3')
    clearDeviceProgress()
    assert.equal(g.localStorage.getItem('ptpt:v1:srs-new:2026-01-01'), null)
    assert.ok(g.localStorage.getItem(SNAP_PREFIX + 'alice'))
  })

  test('resetProgress deletes everything known here and on the server, keeps settings minus lastDiagnosticAt', async () => {
    const be = new FakeBackend()
    const s = newStore('u1', be)
    be.serverAll({
      progress: { t1: prog('t1', 0.9) },
      cards: { c1: card('c1', 1) },
      meta: { settings: { rate: 0.75, lastDiagnosticAt: 99 } },
    })
    be.serverIds = { words: ['w-only-on-server'] }
    let after = 0
    s.afterReset = () => after++
    await s.resetProgress()
    assert.equal(s.progressMap().size, 0)
    assert.equal(s.cardList().length, 0)
    assert.equal(s.settings().rate, 0.75)
    assert.equal(s.settings().lastDiagnosticAt, undefined)
    const ops = be.commits[0].ops
    assert.ok(ops.some((o) => o.col === 'words' && o.id === 'w-only-on-server' && o.data === null))
    assert.equal(after, 1)
  })

  test('export → import round trip', async () => {
    const be = new FakeBackend()
    const s = newStore('u1', be)
    be.serverAll({ progress: { t1: prog('t1', 0.9) }, cards: { c1: card('c1', 1) }, meta: { settings: { rate: 1.25 } } })
    const bundle = await s.exportAll()
    const be2 = new FakeBackend()
    const t = newStore('u2', be2)
    be2.serverAll({})
    await t.importAll(JSON.stringify(bundle))
    assert.equal(t.progressMap().get('t1')?.status, 'confident')
    assert.equal(t.cardList().length, 1)
    assert.equal(t.settings().rate, 1.25)
  })
})

describe('local mode (LocalBackend)', () => {
  test('reads the LocalRepository layout synchronously and writes it back', async () => {
    g.localStorage.setItem('ptpt:v1:progress', JSON.stringify({ t1: prog('t1', 0.9) }))
    g.localStorage.setItem('ptpt:v1:errors', JSON.stringify([{ id: 'e1', exerciseId: 'x', topicId: 't1', given: 'a', expected: 'b', at: 1 }]))
    g.localStorage.setItem('ptpt:v1:settings', JSON.stringify({ rate: 0.75 }))
    const s = new DataStore({ kind: 'local' })
    s.attach(new LocalBackend())
    assert.equal(s.isReady(), true)
    assert.equal(s.getSync().status, 'local')
    assert.equal(s.progressMap().get('t1')?.status, 'confident')
    assert.equal(s.errorList().length, 1)
    assert.equal(s.settings().rate, 0.75)
    await s.upsertCards([card('c1', 1)])
    await s.logError({ exerciseId: 'y', topicId: 't1', given: 'a', expected: 'b', at: 2 })
    assert.ok(JSON.parse(g.localStorage.getItem('ptpt:v1:cards')!).c1)
    assert.equal(JSON.parse(g.localStorage.getItem('ptpt:v1:errors')!).length, 2)
    await s.resetProgress({ resetSettings: true })
    assert.equal(g.localStorage.getItem('ptpt:v1:progress'), null)
    assert.equal(g.localStorage.getItem('ptpt:v1:settings'), null)
  })
})
