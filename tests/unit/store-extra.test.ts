/**
 * DataStore (src/data/store.ts) branches not covered by scripts/store.test.ts: readiness/boot (markReady, whenReady
 * timeout), backend lifecycle (attach/detach/dispose/revalidate), sync status, merge & conflict edge cases
 * (complete vs cache listings, stacked writes, permission-denied), debounced snapshot, ProgressRepository methods,
 * reset/export/import (+ parseExportBundle on garbage), local mode with a full disk, and the React contexts.
 */
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, RepositoryContext, useAuth, useDataStore, useRepository, type AuthState } from '@/data/contexts'
import { LocalBackend } from '@/data/localBackend'
import { DataStore, isPermissionDenied, newerCard, sameData, type Persisted, type SnapshotStorage, type WriteError } from '@/data/store'
import { DEFAULT_SETTINGS, applyResult, newId, parseExportBundle, statusFromPct, type ExportBundle, type SrsCard } from '@/data/types'
import { DAY, NOW, card, errorEntry, fsrs, progress, word } from '../fixtures/seed'
import { FakeBackend, MinimalBackend, tick } from '../helpers/A-data-backend'
import { installStorage, type MemoryStorage } from '../helpers/A-data-storage'

let ls: MemoryStorage

/** In-memory SnapshotStorage that records saves. */
function memSnap(initial: Persisted | null = null) {
  const saves: Persisted[] = []
  let cur = initial
  const s: SnapshotStorage & { saves: Persisted[] } = {
    saves,
    load: () => cur,
    save: (p) => {
      cur = p
      saves.push(p)
    },
  }
  return s
}
const persisted = (docs: Partial<Persisted['docs']> = {}): Persisted => ({
  v: 1,
  savedAt: NOW,
  lastSyncedAt: null,
  docs: { progress: {}, cards: {}, errors: {}, words: {}, meta: {}, ...docs },
})

/** A firestore-kind store attached to a FakeBackend, already server-synced (ready). */
function syncedStore(data: Parameters<FakeBackend['serverAll']>[0] = {}, opts: { snapshot?: SnapshotStorage } = {}) {
  const store = new DataStore({ kind: 'firestore', now: () => NOW, saveDelayMs: 0, ...opts })
  const be = new FakeBackend()
  store.attach(be)
  be.serverAll(data)
  return { store, be }
}

beforeEach(() => {
  ls = installStorage().local
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('helpers: sameData, newerCard, isPermissionDenied', () => {
  it('sameData: deep, key-order independent, undefined keys ignored, arrays vs objects differ', () => {
    expect(sameData({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true)
    expect(sameData({ a: 1, x: undefined }, { a: 1 })).toBe(true)
    expect(sameData({ a: 1 }, { a: 2 })).toBe(false)
    expect(sameData({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(sameData([1, 2], [1, 2, 3])).toBe(false)
    expect(sameData([1], { 0: 1 })).toBe(false)
    expect(sameData(null, {})).toBe(false)
    expect(sameData(1, 1)).toBe(true)
    expect(sameData('a', 'b')).toBe(false)
  })

  it('newerCard: by last review, then updatedAt; missing fsrs counts as 0', () => {
    const a = card('x', { fsrs: fsrs({ last_review: NOW }), updatedAt: 1 })
    const b = card('x', { fsrs: fsrs({ last_review: NOW - DAY }), updatedAt: 9 })
    expect(newerCard(a, b)).toBe(true)
    expect(newerCard(b, a)).toBe(false)
    const c = card('x', { fsrs: fsrs({ last_review: NOW }), updatedAt: 5 })
    expect(newerCard(c, a)).toBe(true)
    expect(newerCard(a, c)).toBe(false)
    const bare = { ...card('x'), fsrs: undefined } as unknown as SrsCard
    expect(newerCard(bare, { ...bare, updatedAt: bare.updatedAt - 1 })).toBe(true)
    expect(newerCard({ ...bare, updatedAt: undefined } as unknown as SrsCard, bare)).toBe(false)
  })

  it('isPermissionDenied', () => {
    expect(isPermissionDenied({ code: 'permission-denied' })).toBe(true)
    expect(isPermissionDenied({ code: 'unavailable' })).toBe(false)
    expect(isPermissionDenied(null)).toBe(false)
    expect(isPermissionDenied('permission-denied')).toBe(false)
  })
})

describe('readiness & boot', () => {
  it('markReady() shows whatever is known after the boot timeout; a no-op once ready', () => {
    const store = new DataStore({ kind: 'firestore' })
    let emits = 0
    store.subscribe(() => emits++)
    expect(store.isReady()).toBe(false)
    store.markReady()
    expect(store.isReady()).toBe(true)
    expect(emits).toBe(1)
    store.markReady()
    expect(emits).toBe(1)
  })

  it('whenReady() resolves at once when ready, on readiness, or after its timeout', async () => {
    vi.useFakeTimers()
    const hydrated = new DataStore({ kind: 'firestore', snapshot: memSnap(persisted()) })
    await expect(hydrated.whenReady()).resolves.toBeUndefined()

    const store = new DataStore({ kind: 'firestore' })
    let resolved = false
    void store.whenReady(5_000).then(() => (resolved = true))
    await vi.advanceTimersByTimeAsync(4_999)
    expect(resolved).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(resolved).toBe(true)

    const store2 = new DataStore({ kind: 'firestore' })
    let r2 = false
    void store2.whenReady(60_000).then(() => (r2 = true))
    const be = new FakeBackend()
    store2.attach(be)
    be.serverAll()
    await vi.advanceTimersByTimeAsync(0)
    expect(r2).toBe(true)
  })

  it('saveTopicResult waits for readiness (never aggregates on top of «not loaded yet»)', async () => {
    const store = new DataStore({ kind: 'firestore', now: () => NOW, saveDelayMs: 0 })
    const be = new FakeBackend()
    store.attach(be)
    const pending = store.saveTopicResult({ topicId: 't', correct: 1, total: 2, at: NOW })
    await tick()
    expect(be.commits).toHaveLength(0)
    be.serverAll({ progress: { t: progress('t', 10) } })
    const res = await pending
    expect(res.attempts).toBe(2) // aggregated on top of the server's progress
    expect(res.bestPct).toBe(1)
  })

  it('offline with partial cache delivery is not ready; online cache-only events never confirm', () => {
    const store = new DataStore({ kind: 'firestore' })
    const be = new FakeBackend()
    store.attach(be)
    be.sink!.remote({ col: 'progress', changes: [], fromServer: false })
    expect(store.isReady()).toBe(false)
    be.sink!.online(false)
    expect(store.isReady()).toBe(false)
    be.cacheAll()
    expect(store.isReady()).toBe(true)
  })

  // BUG A-08: see docs/testing-bugs/A.md — a store that was not hydrated from a snapshot at construction loses
  // readiness on revalidate()/re-attach (serverSynced is cleared, `hydrated` is only set in the constructor).
  it.fails('revalidate() after the first full sync keeps a store (opened without a snapshot) ready', () => {
    const { store, be } = syncedStore({ progress: { t: progress('t', 9) } })
    expect(store.isReady()).toBe(true)
    store.revalidate()
    expect(be.revalidations).toBe(1)
    expect(store.isReady()).toBe(true)
  })
})

describe('backend lifecycle', () => {
  it('attach() replaces a previous backend (stops it) and flushes queued writes to the new one', async () => {
    const store = new DataStore({ kind: 'firestore', saveDelayMs: 0 })
    await store.upsertCards([card('q1')])
    const a = new FakeBackend()
    store.attach(a)
    expect(a.commits.map((c) => c.ops[0].id)).toEqual(['q1'])
    const b = new FakeBackend()
    store.attach(b)
    expect(a.stops).toBe(1)
    expect(a.sink).toBeNull()
    expect(b.connects).toBe(1)
    expect(b.commits).toHaveLength(0) // the queue was flushed to `a`
  })

  it('a queued write that fails on attach is rolled back and reported', async () => {
    const store = new DataStore({ kind: 'firestore', saveDelayMs: 0 })
    const errors: WriteError[] = []
    store.onWriteError((e) => errors.push(e))
    await store.upsertCards([card('q1')])
    expect(store.cardList()).toHaveLength(1)
    const be = new FakeBackend()
    store.attach(be)
    await be.fail(new Error('boom'))
    expect(store.cardList()).toHaveLength(0)
    expect(errors).toHaveLength(1)
  })

  it('revalidate() without backend support is a no-op; with it clears the error and goes back to syncing', () => {
    const store = new DataStore({ kind: 'firestore' })
    store.attach(new MinimalBackend())
    const v = store.getVersion()
    store.revalidate()
    expect(store.getVersion()).toBe(v)

    const { store: s2, be } = syncedStore()
    be.sink!.fail({ code: 'unavailable', message: 'x' })
    expect(s2.getSync().status).toBe('error')
    s2.revalidate()
    expect(s2.getSync()).toMatchObject({ status: 'syncing', error: null })
  })

  it('listener failures: permission-denied, Error message, anything else stringified', () => {
    const { store, be } = syncedStore()
    be.sink!.fail({ code: 'permission-denied' })
    expect(store.getSync().error).toBe('permission-denied')
    be.sink!.fail(new Error('Quota'))
    expect(store.getSync().error).toBe('Quota')
    be.sink!.fail(42)
    expect(store.getSync().error).toBe('42')
  })

  it('online(): repeating the same state does not emit; going offline drops server confirmation', () => {
    const { store, be } = syncedStore()
    const v = store.getVersion()
    be.sink!.online(true)
    expect(store.getVersion()).toBe(v)
    be.sink!.online(false)
    expect(store.getSync().status).toBe('offline')
    be.sink!.online(true)
    expect(store.getSync().status).toBe('syncing')
    be.serverAll()
    expect(store.getSync().status).toBe('synced')
  })

  it('a cache event while offline un-confirms that collection', () => {
    const { store, be } = syncedStore()
    be.sink!.online(false)
    be.sink!.online(true)
    be.serverAll()
    be.sink!.online(false)
    be.sink!.remote({ col: 'cards', changes: [], fromServer: false })
    be.sink!.online(true)
    expect(store.getSync().status).toBe('syncing')
  })

  it('dispose(): flushes the pending snapshot by default; persist:false does not; nothing happens afterwards', async () => {
    vi.useFakeTimers()
    const snap = memSnap()
    const store = new DataStore({ kind: 'firestore', snapshot: snap, saveDelayMs: 300 })
    await store.upsertCards([card('c1')])
    expect(snap.saves).toHaveLength(0)
    store.dispose()
    expect(snap.saves).toHaveLength(1)
    store.attach(new FakeBackend()) // ignored after dispose
    store.flushSave()
    expect(snap.saves).toHaveLength(1)

    const snap2 = memSnap()
    const s2 = new DataStore({ kind: 'firestore', snapshot: snap2, saveDelayMs: 300 })
    await s2.upsertCards([card('c1')])
    s2.dispose({ persist: false })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(snap2.saves).toHaveLength(0)
  })

  it('acks and failures arriving after dispose do not touch memory or listeners', async () => {
    const { store, be } = syncedStore()
    const errors: WriteError[] = []
    store.onWriteError((e) => errors.push(e))
    await store.upsertCards([card('a')])
    await store.upsertCards([card('b')])
    // dispose keeps the backend's promises alive
    const commits = [...be.commits]
    store.dispose()
    commits[0].resolve()
    commits[1].reject(new Error('late'))
    await tick()
    expect(errors).toHaveLength(0)
    expect(store.cardList().map((c) => c.id).sort()).toEqual(['a', 'b'])
  })

  it('debounced snapshot: many writes → one save after the delay; flushSave() saves at once', async () => {
    vi.useFakeTimers()
    const snap = memSnap()
    const store = new DataStore({ kind: 'firestore', snapshot: snap, saveDelayMs: 300, now: () => NOW })
    await store.upsertCards([card('a')])
    await store.upsertCards([card('b')])
    await vi.advanceTimersByTimeAsync(299)
    expect(snap.saves).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(snap.saves).toHaveLength(1)
    expect(Object.keys(snap.saves[0].docs.cards).sort()).toEqual(['a', 'b'])
    expect(snap.saves[0].savedAt).toBe(NOW)
    await store.upsertCards([card('c')])
    store.flushSave()
    expect(snap.saves).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(snap.saves).toHaveLength(2)
  })

  it('without a snapshot storage nothing is saved and nothing throws', async () => {
    const store = new DataStore({ kind: 'firestore', saveDelayMs: 0 })
    await store.upsertCards([card('a')])
    expect(() => store.flushSave()).not.toThrow()
  })
})

describe('sync status', () => {
  it('local kind always reports «local», even with pending writes', async () => {
    const store = new DataStore({ kind: 'local' })
    expect(store.getSync().status).toBe('local')
    const p = store.upsertCards([card('a')]) // queued (no backend)
    expect(store.getSync()).toMatchObject({ status: 'local', pendingWrites: 1 })
    store.attach(new MinimalBackend())
    await p
    expect(store.getSync().pendingWrites).toBe(0)
  })

  it('syncing while writes are pending, synced (lastSyncedAt) once acknowledged', async () => {
    let t = NOW
    const store = new DataStore({ kind: 'firestore', now: () => t, saveDelayMs: 0 })
    const be = new FakeBackend()
    store.attach(be)
    be.serverAll()
    expect(store.getSync()).toMatchObject({ status: 'synced', lastSyncedAt: NOW })
    t = NOW + 1000
    await store.upsertCards([card('a')])
    expect(store.getSync()).toMatchObject({ status: 'syncing', pendingWrites: 1, lastSyncedAt: NOW })
    await be.ack()
    expect(store.getSync()).toMatchObject({ status: 'synced', pendingWrites: 0, lastSyncedAt: NOW + 1000 })
  })

  it('getSync() keeps its identity when nothing about the sync changed', () => {
    const { store, be } = syncedStore()
    const s = store.getSync()
    be.sink!.remote({ col: 'cards', changes: [{ id: 'x', data: card('x') }], fromServer: true })
    expect(store.getSync()).toBe(s)
  })

  it('a permission-denied write sets the error status', async () => {
    const { store, be } = syncedStore()
    await store.upsertCards([card('a')])
    await be.fail({ code: 'permission-denied' })
    expect(store.getSync()).toMatchObject({ status: 'error', error: 'permission-denied' })
  })
})

describe('remote merge edge cases', () => {
  it('remote deletion of an unknown document changes nothing (no emit of new data)', () => {
    const { store, be } = syncedStore({ cards: { a: card('a') } })
    const list = store.cardList()
    be.sink!.remote({ col: 'cards', changes: [{ id: 'zzz', data: null }], fromServer: false })
    expect(store.cardList()).toBe(list)
  })

  it('remote deletion of a known document removes it', () => {
    const { store, be } = syncedStore({ cards: { a: card('a'), b: card('b') } })
    be.sink!.remote({ col: 'cards', changes: [{ id: 'a', data: null }], fromServer: true })
    expect(store.cardList().map((c) => c.id)).toEqual(['b'])
  })

  it('a cache-only complete listing never deletes (an empty cache must not wipe the snapshot)', () => {
    const store = new DataStore({ kind: 'firestore', snapshot: memSnap(persisted({ cards: { a: card('a') } })), saveDelayMs: 0 })
    const be = new FakeBackend()
    store.attach(be)
    be.cacheAll()
    expect(store.cardList().map((c) => c.id)).toEqual(['a'])
    be.serverAll()
    expect(store.cardList()).toEqual([])
  })

  it('a complete server listing keeps documents with a pending local write', async () => {
    const { store, be } = syncedStore()
    await store.upsertCards([card('local')])
    be.serverAll({ cards: { other: card('other') } })
    expect(store.cardList().map((c) => c.id).sort()).toEqual(['local', 'other'])
    await be.ack()
    expect(store.cardList().map((c) => c.id).sort()).toEqual(['local', 'other'])
  })

  it('a cache event without changes still saves nothing new; a server one re-saves (lastSyncedAt)', () => {
    const snap = memSnap()
    const store = new DataStore({ kind: 'firestore', snapshot: snap, saveDelayMs: 0, now: () => NOW })
    const be = new FakeBackend()
    store.attach(be)
    be.sink!.remote({ col: 'cards', changes: [], fromServer: false })
    expect(snap.saves).toHaveLength(0)
    be.serverAll()
    expect(snap.saves.at(-1)?.lastSyncedAt).toBe(NOW)
  })
})

describe('stacked writes and conflicts', () => {
  it('two writes in flight to one document: the first ack keeps the doc pending; remote waits in the shadow', async () => {
    const { store, be } = syncedStore()
    await store.upsertCards([card('x', { front: 'v1' })])
    await store.upsertCards([card('x', { front: 'v2' })])
    be.sink!.remote({ col: 'cards', changes: [{ id: 'x', data: card('x', { front: 'remote' }) }], fromServer: true })
    expect(store.cardList()[0].front).toBe('v2')
    await be.ack(0)
    expect(store.cardList()[0].front).toBe('v2')
    expect(store.getSync().pendingWrites).toBe(1)
    await be.ack(0)
    expect(store.cardList()[0].front).toBe('v2')
    expect(store.getSync().pendingWrites).toBe(0)
  })

  it('first of two stacked writes fails: nothing is rolled back while the second is in flight', async () => {
    const { store, be } = syncedStore({ cards: { x: card('x', { front: 'server' }) } })
    const errors: WriteError[] = []
    store.onWriteError((e) => errors.push(e))
    await store.upsertCards([card('x', { front: 'v1' })])
    await store.upsertCards([card('x', { front: 'v2' })])
    await be.fail(new Error('e1'), 0)
    expect(store.cardList()[0].front).toBe('v2')
    expect(errors).toHaveLength(1)
    await be.fail(new Error('e2'), 0)
    expect(store.cardList()[0].front).toBe('server') // back to the value before the first pending write
  })

  it('a failed write of a document the server deleted meanwhile rolls back to «deleted»', async () => {
    const { store, be } = syncedStore({ cards: { x: card('x') } })
    await store.upsertCards([card('x', { front: 'edit' })])
    be.sink!.remote({ col: 'cards', changes: [{ id: 'x', data: null }], fromServer: true })
    await be.fail(new Error('nope'))
    expect(store.cardList()).toEqual([])
  })

  it('a new document whose write fails disappears again', async () => {
    const { store, be } = syncedStore()
    await store.upsertCards([card('new')])
    await be.fail(new Error('x'))
    expect(store.cardList()).toEqual([])
  })

  it('SRS: an older remote card does not override an acknowledged newer local review', async () => {
    const { store, be } = syncedStore()
    await store.upsertCards([card('x', { fsrs: fsrs({ last_review: NOW }) })])
    be.sink!.remote({ col: 'cards', changes: [{ id: 'x', data: card('x', { fsrs: fsrs({ last_review: NOW - DAY }) }) }], fromServer: true })
    await be.ack()
    expect(store.cardList()[0].fsrs.last_review).toBe(NOW)
    expect(be.commits).toHaveLength(0) // no re-commit
  })

  it('non-card collections: the acknowledged local write wins over the shadow', async () => {
    const { store, be } = syncedStore()
    await store.upsertWords([word('casa', 'дом')])
    be.sink!.remote({ col: 'words', changes: [{ id: 'u:casa', data: word('casa', 'remote') }], fromServer: true })
    await be.ack()
    expect(store.wordList()[0].ru).toBe('дом')
  })

  it('onWriteError() unsubscribe stops reports', async () => {
    const { store, be } = syncedStore()
    const seen: unknown[] = []
    const off = store.onWriteError((e) => seen.push(e.error))
    await store.upsertCards([card('a')])
    await be.fail('first')
    off()
    await store.upsertCards([card('b')])
    await be.fail('second')
    expect(seen).toEqual(['first'])
  })

  it('subscribe() unsubscribe stops notifications', async () => {
    const store = new DataStore({ kind: 'firestore' })
    let n = 0
    const off = store.subscribe(() => n++)
    await store.upsertCards([card('a')])
    off()
    await store.upsertCards([card('b')])
    expect(n).toBe(1)
  })

  it('write([]) resolves without emitting', async () => {
    const store = new DataStore({ kind: 'firestore' })
    const v = store.getVersion()
    await store.write([])
    expect(store.getVersion()).toBe(v)
  })
})

describe('ProgressRepository methods', () => {
  it('progress: getTopicProgress / saveTopicResult / getAllProgress', async () => {
    const { store, be } = syncedStore()
    expect(await store.getTopicProgress('t')).toBeUndefined()
    const p = await store.saveTopicResult({ topicId: 't', correct: 9, total: 10, at: NOW })
    expect(p.status).toBe('confident')
    expect(await store.getTopicProgress('t')).toEqual(p)
    expect(await store.getAllProgress()).toEqual([p])
    expect(be.commits[0].ops).toEqual([{ col: 'progress', id: 't', data: p }])
  })

  it('cards: getCards; deleteCards ignores unknown ids (no empty commit)', async () => {
    const { store, be } = syncedStore({ cards: { a: card('a') } })
    expect((await store.getCards()).map((c) => c.id)).toEqual(['a'])
    await store.deleteCards(['nope'])
    expect(be.commits).toHaveLength(0)
    await store.deleteCards(['a', 'nope'])
    expect(be.commits[0].ops).toEqual([{ col: 'cards', id: 'a', data: null }])
    expect(await store.getCards()).toEqual([])
  })

  it('errors: logError assigns an id; getErrors is newest first', async () => {
    const { store } = syncedStore()
    const e1 = await store.logError({ exerciseId: 'x', topicId: 't', given: 'a', expected: 'b', at: NOW - 10 })
    const e2 = await store.logError({ exerciseId: 'y', topicId: 't', given: 'a', expected: 'b', at: NOW })
    expect(e1.id).toBeTruthy()
    expect(e1.id).not.toBe(e2.id)
    expect((await store.getErrors()).map((e) => e.exerciseId)).toEqual(['y', 'x'])
  })

  it('words: upsert / delete (unknown ignored) / getWords', async () => {
    const { store, be } = syncedStore()
    await store.upsertWords([word('casa', 'дом'), word('gato', 'кот')])
    await store.deleteWords(['u:casa', 'u:nope'])
    expect((await store.getWords()).map((w) => w.id)).toEqual(['u:gato'])
    expect(be.commits[1].ops).toEqual([{ col: 'words', id: 'u:casa', data: null }])
  })

  it('saveWordBundle: one commit, sets before deletes; empty input writes nothing', async () => {
    const { store, be } = syncedStore({ words: { 'u:old': word('old', 'x') }, cards: { 'lex:u:old:recognize': card('lex:u:old:recognize') } })
    const w = word('casa', 'дом')
    await store.saveWordBundle({ words: [w], cards: [card('lex:u:casa:recognize')], deleteWordIds: ['u:old'], deleteCardIds: ['lex:u:old:recognize'] })
    expect(be.commits).toHaveLength(1)
    expect(be.commits[0].ops.map((o) => `${o.col}/${o.id}/${o.data ? 'set' : 'del'}`)).toEqual([
      'words/u:casa/set',
      'cards/lex:u:casa:recognize/set',
      'words/u:old/del',
      'cards/lex:u:old:recognize/del',
    ])
    await store.saveWordBundle({})
    expect(be.commits).toHaveLength(1)
  })

  it('settings: defaults merged; saveSettings merges with the server document (whole doc written)', async () => {
    const { store, be } = syncedStore({ meta: { settings: { voice: 'male', rate: 1.25 } } })
    expect(await store.getSettings()).toEqual({ ...DEFAULT_SETTINGS, voice: 'male', rate: 1.25 })
    const next = await store.saveSettings({ newCardsPerDay: 5 })
    expect(next).toEqual({ ...DEFAULT_SETTINGS, voice: 'male', rate: 1.25, newCardsPerDay: 5 })
    expect(be.commits[0].ops[0]).toEqual({ col: 'meta', id: 'settings', data: next })
  })

  it('settings: a partial/old settings document still yields every field', () => {
    const { store } = syncedStore({ meta: { settings: { voice: 'male' } } })
    const s = store.settings()
    expect(s.wordModes).toEqual(DEFAULT_SETTINGS.wordModes)
    expect(s.typeWordAnswers).toBe(true)
    expect(store.settings()).toBe(s) // memoized
  })
})

describe('resetProgress', () => {
  it('server ids that failed to load: still deletes everything known locally', async () => {
    const { store, be } = syncedStore({ progress: { t: progress('t', 5) }, errors: { e: errorEntry('e') } })
    be.allIdsError = new Error('offline')
    await store.resetProgress()
    expect(be.commits[0].ops.map((o) => `${o.col}/${o.id}`).sort()).toEqual(['errors/e', 'progress/t'])
  })

  it('without a backend (local queue) only known documents are deleted', async () => {
    const store = new DataStore({ kind: 'firestore', snapshot: memSnap(persisted({ cards: { c: card('c') } })) })
    await store.resetProgress()
    expect(store.cardList()).toEqual([])
  })

  it('keeps settings without lastDiagnosticAt untouched (no settings op)', async () => {
    const { store, be } = syncedStore({ meta: { settings: { voice: 'male' } }, cards: { c: card('c') } })
    await store.resetProgress()
    expect(be.commits[0].ops.some((o) => o.col === 'meta')).toBe(false)
    expect(store.settings().voice).toBe('male')
  })

  it('resetSettings deletes the settings document; afterReset gets the options', async () => {
    const { store, be } = syncedStore({ meta: { settings: { voice: 'male', lastDiagnosticAt: NOW } } })
    const calls: unknown[] = []
    store.afterReset = (o) => calls.push(o)
    await store.resetProgress({ resetSettings: true })
    expect(be.commits[0].ops).toContainEqual({ col: 'meta', id: 'settings', data: null })
    expect(store.settings()).toEqual(DEFAULT_SETTINGS)
    expect(calls).toEqual([{ resetSettings: true }])
  })

  it('a reset of an empty store writes nothing', async () => {
    const { store, be } = syncedStore()
    await store.resetProgress()
    expect(be.commits).toHaveLength(0)
  })
})

describe('export / import', () => {
  const bundle = (patch: Record<string, unknown> = {}) => ({ app: 'portugues-pt', version: 1, exportedAt: NOW, ...patch })

  it('exportAll contains every collection and full settings', async () => {
    const { store } = syncedStore({
      progress: { t: progress('t', 5) },
      cards: { c: card('c') },
      errors: { e: errorEntry('e') },
      words: { 'u:casa': word('casa', 'дом') },
    })
    const b = await store.exportAll()
    expect(b).toMatchObject({ app: 'portugues-pt', version: 1, exportedAt: NOW })
    expect([b.progress.length, b.cards.length, b.errors.length, b.words?.length]).toEqual([1, 1, 1, 1])
    expect(b.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('importAll accepts a JSON string; an old file without words imports fine; settings are replaced', async () => {
    const { store } = syncedStore({ meta: { settings: { voice: 'male' } }, words: { 'u:keep': word('keep', 'x') } })
    await store.importAll(JSON.stringify(bundle({ progress: [progress('t', 9)], cards: [], errors: [], settings: { rate: 0.75 } })))
    expect(store.progressList().map((p) => p.topicId)).toEqual(['t'])
    expect(store.settings()).toEqual({ ...DEFAULT_SETTINGS, rate: 0.75 }) // voice back to default: replaced
    expect(store.wordList().map((w) => w.id)).toEqual(['u:keep'])
  })

  it.each([
    ['not JSON', 'definitely not json'],
    ['JSON null', 'null'],
    ['a JSON string', '"hello"'],
    ['another app', JSON.stringify({ app: 'other', version: 1 })],
    ['a future version', JSON.stringify({ app: 'portugues-pt', version: 2 })],
  ])('importAll rejects %s and writes nothing', async (_n, raw) => {
    const { store, be } = syncedStore()
    await expect(store.importAll(raw)).rejects.toThrow()
    expect(be.commits).toHaveLength(0)
  })

  it('parseExportBundle: non-array collections become [], missing exportedAt → now, garbage words are filtered/normalized', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const b = parseExportBundle(
      bundle({
        exportedAt: 'soon',
        progress: 'x',
        cards: { a: 1 },
        errors: null,
        settings: null,
        words: [null, 'str', { id: '', lemma: 'a', ru: 'b' }, { id: 'u:a', lemma: 'a' }, { id: 'u:ok', lemma: 'ok', ru: 'да', sources: 'x', modes: [], createdAt: 'x' }, { ...word('w', 'в'), sources: Array.from({ length: 8 }, (_, i) => ({ src: 'manual', form: `f${i}`, at: i })) }],
      }) as unknown as ExportBundle,
    )
    expect(b.exportedAt).toBe(NOW)
    expect([b.progress, b.cards, b.errors]).toEqual([[], [], []])
    expect(b.settings).toEqual(DEFAULT_SETTINGS)
    expect(b.words.map((w) => w.id)).toEqual(['u:ok', 'u:w'])
    expect(b.words[0]).toMatchObject({ sources: [], modes: ['recognize'], createdAt: NOW, updatedAt: NOW })
    expect(b.words[1].sources.map((s) => s.form)).toEqual(['f3', 'f4', 'f5', 'f6', 'f7'])
  })

  // BUG A-09: see docs/testing-bugs/A.md — parseExportBundle validates `words` only; malformed progress / cards /
  // errors entries are imported as documents keyed "undefined" (or crash with a TypeError on null).
  it.fails('importAll skips (or rejects) malformed progress / cards / errors entries', async () => {
    const { store } = syncedStore()
    await store
      .importAll(bundle({ progress: [{}, progress('ok', 5)], cards: [{ front: 'no id' }], errors: [{ given: 'x' }] }) as unknown as ExportBundle)
      .catch(() => {})
    const docs = store.getDocs()
    expect(Object.keys(docs.progress)).not.toContain('undefined')
    expect(Object.keys(docs.cards)).not.toContain('undefined')
    expect(Object.keys(docs.errors)).not.toContain('undefined')
  })
})

describe('types.ts helpers', () => {
  it('statusFromPct thresholds and applyResult aggregation (history capped at 20)', () => {
    expect(statusFromPct(undefined)).toBe('not-started')
    expect(statusFromPct(0.59)).toBe('weak')
    expect(statusFromPct(0.6)).toBe('learning')
    expect(statusFromPct(0.85)).toBe('confident')
    let p = applyResult(undefined, { topicId: 't', correct: 0, total: 0, at: 1 })
    expect(p).toMatchObject({ lastPct: 0, attempts: 1, status: 'weak' })
    for (let i = 0; i < 25; i++) p = applyResult(p, { topicId: 't', correct: i % 2 ? 10 : 1, total: 10, at: i })
    expect(p.history).toHaveLength(20)
    expect(p.attempts).toBe(26)
    expect(p.bestPct).toBe(1)
    expect(p.lastAt).toBe(24)
  })

  it('newId falls back when crypto.randomUUID is missing', () => {
    vi.stubGlobal('crypto', {})
    const a = newId()
    const b = newId()
    expect(a).toMatch(/^[a-z0-9]+-[a-z0-9]+$/)
    expect(a).not.toBe(b)
  })
})

describe('local mode with a full disk (LocalBackend + quota)', () => {
  it('a write that does not fit is rejected to the caller and rolled back in memory', async () => {
    const store = new DataStore({ kind: 'local' })
    store.attach(new LocalBackend())
    ls.failSetItem = (k) => k === 'ptpt:v1:cards'
    await expect(store.upsertCards([card('a')])).rejects.toThrow(/quota/i)
    expect(store.cardList()).toEqual([])
    expect(ls.getItem('ptpt:v1:cards')).toBeNull()
  })

  // BUG A-10: see docs/testing-bugs/A.md — LocalBackend.commit writes collection by collection; when a later
  // collection hits the quota the earlier ones stay in localStorage while the store rolls all of them back.
  it.fails('a word bundle that only partly fits leaves memory and localStorage consistent', async () => {
    const store = new DataStore({ kind: 'local' })
    store.attach(new LocalBackend())
    ls.failSetItem = (k) => k === 'ptpt:v1:cards'
    const w = word('casa', 'дом')
    await expect(store.saveWordBundle({ words: [w], cards: [card('lex:u:casa:recognize')] })).rejects.toThrow()
    expect(store.wordList()).toEqual([]) // rolled back in memory…
    expect(ls.getItem('ptpt:v1:words')).toBeNull() // …but the words were already persisted
  })
})

describe('contexts', () => {
  function Probe({ use }: { use: () => unknown }) {
    const v = use()
    return createElement('span', null, typeof v === 'object' && v && 'kind' in v ? String((v as { kind: string }).kind) : String((v as AuthState).status))
  }

  it('useAuth / useRepository / useDataStore throw outside their providers', () => {
    expect(() => renderToString(createElement(Probe, { use: useAuth }))).toThrow(/AuthProvider/)
    expect(() => renderToString(createElement(Probe, { use: useRepository }))).toThrow(/RepositoryProvider/)
    expect(() => renderToString(createElement(Probe, { use: useDataStore }))).toThrow(/RepositoryProvider/)
  })

  it('return the provided values', () => {
    const store = new DataStore({ kind: 'local' })
    const auth = { status: 'disabled', user: null, verified: false, error: null, signIn: async () => {}, signOut: async () => {} } satisfies AuthState
    expect(renderToString(createElement(AuthContext.Provider, { value: auth }, createElement(Probe, { use: useAuth })))).toContain('disabled')
    expect(renderToString(createElement(RepositoryContext.Provider, { value: store }, createElement(Probe, { use: useRepository })))).toContain('local')
    expect(renderToString(createElement(RepositoryContext.Provider, { value: store }, createElement(Probe, { use: useDataStore })))).toContain('local')
  })
})

// ─── FirestoreBackend over a fake SDK ─────────────────────────────────────────────────────────

const fs = vi.hoisted(() => {
  type Listener = { path: string; next: (snap: unknown) => void; error: (e: unknown) => void }
  const state = {
    initThrows: false,
    inits: 0,
    getFirestoreCalls: 0,
    emulator: [] as unknown[],
    listeners: [] as Listener[],
    batches: [] as { ops: { op: 'set' | 'delete'; path: string; data?: unknown }[] }[],
    server: {} as Record<string, string[]>,
  }
  const db = { fake: 'db' }
  const pathOf = (r: unknown) => (r as { path: string }).path
  return {
    state,
    mod: {
      initializeFirestore: () => {
        state.inits++
        if (state.initThrows) throw new Error('already initialized')
        return db
      },
      getFirestore: () => {
        state.getFirestoreCalls++
        return db
      },
      persistentLocalCache: (o: unknown) => o,
      persistentMultipleTabManager: () => ({}),
      connectFirestoreEmulator: (...a: unknown[]) => state.emulator.push(a),
      collection: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }),
      doc: (parent: unknown, ...segs: string[]) =>
        parent === db ? { path: segs.join('/') } : { path: `${pathOf(parent)}/${segs.join('/')}` },
      onSnapshot: (ref: unknown, _opts: unknown, next: (s: unknown) => void, error: (e: unknown) => void) => {
        const l = { path: pathOf(ref), next, error }
        state.listeners.push(l)
        return () => {
          state.listeners = state.listeners.filter((x) => x !== l)
        }
      },
      writeBatch: () => {
        const b = { ops: [] as { op: 'set' | 'delete'; path: string; data?: unknown }[] }
        state.batches.push(b)
        return {
          set: (r: unknown, data: unknown) => b.ops.push({ op: 'set', path: pathOf(r), data }),
          delete: (r: unknown) => b.ops.push({ op: 'delete', path: pathOf(r) }),
          commit: async () => {},
        }
      },
      getDocs: async (r: unknown) => ({ docs: (state.server[pathOf(r)] ?? []).map((id) => ({ id })) }),
    },
  }
})
vi.mock('firebase/firestore', () => fs.mod)
vi.mock('@/data/firebase', () => ({ emulatorHost: '127.0.0.1' }))

/** A fake collection QuerySnapshot. */
function colSnap(fromCache: boolean, docs: Record<string, object>, changes: { type: 'added' | 'modified' | 'removed'; id: string; data?: object }[] = []) {
  return {
    metadata: { fromCache },
    docs: Object.entries(docs).map(([id, d]) => ({ id, data: () => d })),
    docChanges: () => changes.map((c) => ({ type: c.type, doc: { id: c.id, data: () => c.data } })),
  }
}
const docSnap = (fromCache: boolean, data?: object) => ({ metadata: { fromCache }, exists: () => data !== undefined, data: () => data })

describe('FirestoreBackend (fake SDK)', () => {
  type Ev = (e?: unknown) => void
  let events: Record<string, Ev[]>
  beforeEach(() => {
    events = {}
    fs.state.listeners = []
    fs.state.batches = []
    vi.stubGlobal('addEventListener', (t: string, fn: Ev) => (events[t] ??= []).push(fn))
    vi.stubGlobal('removeEventListener', (t: string, fn: Ev) => (events[t] = (events[t] ?? []).filter((f) => f !== fn)))
  })
  const load = () => import('@/data/firestoreBackend')
  const app = {} as import('firebase/app').FirebaseApp
  const listener = (suffix: string) => fs.state.listeners.find((l) => l.path.endsWith(suffix))!

  it('db singleton: falls back to getFirestore when already initialized; connects the emulator only on init', async () => {
    const { FirestoreBackend } = await load()
    new FirestoreBackend(app, 'u1')
    new FirestoreBackend(app, 'u2')
    expect(fs.state.inits).toBe(1) // singleton kept
    expect(fs.state.emulator).toEqual([[{ fake: 'db' }, '127.0.0.1', 8080]])
    vi.resetModules() // fresh module: dbSingleton = null
    fs.state.initThrows = true
    const fresh = await load()
    new fresh.FirestoreBackend(app, 'u3')
    fs.state.initThrows = false
    expect(fs.state.getFirestoreCalls).toBe(1)
    expect(fs.state.emulator).toHaveLength(1)
  })

  it('listeners: cache first, then the complete server listing, then changes; ids are decoded', async () => {
    const { FirestoreBackend } = await load()
    const store = new DataStore({ kind: 'firestore', saveDelayMs: 0 })
    store.attach(new FirestoreBackend(app, 'uid1'))
    expect(fs.state.listeners.map((l) => l.path).sort()).toEqual(
      ['users/uid1/cards', 'users/uid1/errors', 'users/uid1/meta/settings', 'users/uid1/progress', 'users/uid1/words'].sort(),
    )
    const cards = listener('/cards')
    cards.next(colSnap(true, {}, [{ type: 'added', id: 'lex%3Au%3Acasa%3Arecognize', data: card('lex:u:casa:recognize') }]))
    expect(store.cardList().map((c) => c.id)).toEqual(['lex:u:casa:recognize'])
    expect(store.isReady()).toBe(false)
    // complete server listing drops what the server does not have; a malformed %-escape is kept raw
    cards.next(colSnap(false, { 'bad%E0%A4%A': card('bad%E0%A4%A') }))
    expect(store.getDocs().cards).toHaveProperty(['bad%E0%A4%A'])
    expect(store.getDocs().cards).not.toHaveProperty(['lex:u:casa:recognize'])
    cards.next(colSnap(false, {}, [{ type: 'removed', id: 'bad%E0%A4%A' }]))
    expect(store.cardList()).toEqual([])
    for (const c of ['/progress', '/errors', '/words']) listener(c).next(colSnap(false, {}))
    const meta = listener('/meta/settings')
    meta.next(docSnap(true)) // not in the cache ≠ deleted
    expect(store.isReady()).toBe(false)
    meta.next(docSnap(false, { voice: 'male' }))
    expect(store.isReady()).toBe(true)
    expect(store.settings().voice).toBe('male')
    meta.next(docSnap(false)) // deleted on the server
    expect(store.settings().voice).toBe(DEFAULT_SETTINGS.voice)
    store.dispose()
    expect(fs.state.listeners).toHaveLength(0)
  })

  it('online/offline events and navigator.onLine at connect', async () => {
    const { FirestoreBackend } = await load()
    vi.stubGlobal('navigator', { onLine: false })
    const online: boolean[] = []
    const be = new FirestoreBackend(app, 'u')
    const stop = be.connect({ remote: () => {}, online: (o) => online.push(o), fail: () => {} })
    events.online.forEach((f) => f())
    events.offline.forEach((f) => f())
    expect(online).toEqual([false, true, false])
    stop()
    expect(events.online).toHaveLength(0)
    expect(events.offline).toHaveLength(0)
    be.revalidate() // no sink: no-op
    expect(fs.state.listeners).toHaveLength(0)
  })

  it('listener errors: permission-denied is final; others re-listen after 15 s', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { FirestoreBackend } = await load()
    const fails: unknown[] = []
    const be = new FirestoreBackend(app, 'u')
    be.connect({ remote: () => {}, online: () => {}, fail: (e) => fails.push(e) })
    const first = fs.state.listeners[0]
    first.error({ code: 'permission-denied' })
    vi.advanceTimersByTime(20_000)
    expect(fs.state.listeners[0]).toBe(first)
    first.error({ code: 'unavailable' })
    vi.advanceTimersByTime(14_999)
    expect(fs.state.listeners[0]).toBe(first)
    vi.advanceTimersByTime(1)
    expect(fs.state.listeners).toHaveLength(5)
    expect(fs.state.listeners[0]).not.toBe(first)
    expect(fails).toHaveLength(2)
  })

  it('commit: batches of ≤ 450 ops, encoded ids, settings under meta, set vs delete', async () => {
    const { FirestoreBackend } = await load()
    const be = new FirestoreBackend(app, 'u')
    const ops = Array.from({ length: 1000 }, (_, i) => ({ col: 'cards' as const, id: `lex:w${i}:recognize`, data: { i } }))
    await be.commit([...ops, { col: 'meta', id: 'settings', data: null }, { col: 'words', id: 'u:são', data: null }])
    expect(fs.state.batches.map((b) => b.ops.length)).toEqual([450, 450, 102])
    expect(fs.state.batches[0].ops[0]).toEqual({ op: 'set', path: 'users/u/cards/lex%3Aw0%3Arecognize', data: { i: 0 } })
    expect(fs.state.batches[2].ops.slice(-2)).toEqual([
      { op: 'delete', path: 'users/u/meta/settings' },
      { op: 'delete', path: `users/u/words/${encodeURIComponent('u:são')}` },
    ])
  })

  it('allIds: decoded ids of every progress collection (used by reset)', async () => {
    const { FirestoreBackend } = await load()
    fs.state.server = { 'users/u/cards': ['lex%3Aa', 'plain'], 'users/u/words': ['u%3Acasa'] }
    const ids = await new FirestoreBackend(app, 'u').allIds()
    expect(ids).toEqual({ progress: [], cards: ['lex:a', 'plain'], errors: [], words: ['u:casa'] })
  })
})
