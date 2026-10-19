/**
 * Device snapshot (src/data/snapshot.ts): per-uid storage of the DataStore, quota handling, MAX_CHARS, malformed
 * stored JSON, sign-out (forgetUser) incl. an in-flight write, the cached sign-in.
 * snapshot.ts keeps module state (forgotten uids, listeners): every test uses its own uid.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_USER_KEY, SNAP_PREFIX, forgetUser, hasSnapshot, onForgetUser, readCachedUser, snapshotStorage, writeCachedUser } from '@/data/snapshot'
import { DataStore, type Persisted } from '@/data/store'
import { NOW, card, errorEntry, progress, snapshotEntries, applyEntries, word } from '../fixtures/seed'
import { FakeBackend } from '../helpers/A-data-backend'
import { installStorage, installThrowingStorage, removeStorage, type MemoryStorage } from '../helpers/A-data-storage'

let ls: MemoryStorage
let n = 0
/** A fresh uid per test (module-level `forgotten` set). */
const uid = (name = 'u') => `${name}-${++n}-${Math.random().toString(36).slice(2, 7)}`

const persisted = (patch: Partial<Persisted['docs']> = {}, lastSyncedAt: number | null = null): Persisted => ({
  v: 1,
  savedAt: NOW,
  lastSyncedAt,
  docs: { progress: {}, cards: {}, errors: {}, words: {}, meta: {}, ...patch },
})

beforeEach(() => {
  ls = installStorage().local
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('snapshotStorage.load', () => {
  it('returns null when nothing is stored', () => {
    expect(snapshotStorage(uid()).load()).toBeNull()
  })

  it('round-trips what save() wrote', () => {
    const u = uid()
    const s = snapshotStorage(u)
    const p = persisted({ progress: { t: progress('t', 9) } }, NOW - 5)
    s.save(p)
    expect(ls.getItem(SNAP_PREFIX + u)).not.toBeNull()
    expect(s.load()).toEqual(p)
  })

  it.each([
    ['malformed JSON', '{"v":1,'],
    ['JSON null', 'null'],
    ['a number', '42'],
    ['wrong version', JSON.stringify({ v: 2, savedAt: 1, lastSyncedAt: null, docs: {} })],
    ['missing docs', JSON.stringify({ v: 1, savedAt: 1, lastSyncedAt: null })],
    ['docs null', JSON.stringify({ v: 1, savedAt: 1, lastSyncedAt: null, docs: null })],
  ])('ignores a stored value with %s', (_name, raw) => {
    const u = uid()
    ls.setItem(SNAP_PREFIX + u, raw)
    expect(snapshotStorage(u).load()).toBeNull()
  })

  it('returns null when localStorage is unavailable (getter throws) or absent', () => {
    const u = uid()
    installThrowingStorage()
    expect(snapshotStorage(u).load()).toBeNull()
    expect(hasSnapshot(u)).toBe(false)
    removeStorage()
    expect(snapshotStorage(u).load()).toBeNull()
    expect(hasSnapshot(u)).toBe(false)
  })

  it('partial records: a snapshot without some collections hydrates them as empty', () => {
    const u = uid()
    ls.setItem(SNAP_PREFIX + u, JSON.stringify({ v: 1, savedAt: 1, lastSyncedAt: 7, docs: { progress: { t: progress('t', 5) } } }))
    const store = new DataStore({ kind: 'firestore', snapshot: snapshotStorage(u), saveDelayMs: 0 })
    expect(store.isReady()).toBe(true)
    expect(store.progressList().map((p) => p.topicId)).toEqual(['t'])
    expect(store.cardList()).toEqual([])
    expect(store.wordList()).toEqual([])
    expect(store.errorList()).toEqual([])
    expect(store.settings().newCardsPerDay).toBe(15)
    expect(store.getSync().lastSyncedAt).toBe(7)
  })

  // BUG A-07: see docs/testing-bugs/A.md — load() only checks `v` and truthy `docs`; a collection stored as null
  // (or another non-object) passes and crashes every read of the store (progressMap / settings) on boot.
  it('wrong shapes: a snapshot with a null collection does not crash the store', () => {
    const u = uid()
    ls.setItem(SNAP_PREFIX + u, JSON.stringify({ v: 1, savedAt: 1, lastSyncedAt: null, docs: { progress: null, meta: null } }))
    const store = new DataStore({ kind: 'firestore', snapshot: snapshotStorage(u), saveDelayMs: 0 })
    expect(() => store.progressMap()).not.toThrow()
    expect(() => store.settings()).not.toThrow()
  })
})

describe('snapshot: broken documents', () => {
  it('documents of the wrong shape are dropped on load; the rest stays readable', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const u = uid()
    const docs = { progress: { t: progress('t', 7), bad: { topicId: 'bad', history: 5 } }, cards: { x: { id: 'x' }, c: card('c') }, errors: [1, 2], words: 'w', meta: { settings: { rate: 'fast' } } }
    ls.setItem(SNAP_PREFIX + u, JSON.stringify({ v: 1, savedAt: 1, lastSyncedAt: 'x', docs }))
    const store = new DataStore({ kind: 'firestore', snapshot: snapshotStorage(u), saveDelayMs: 0 })
    expect(store.isReady()).toBe(true)
    expect(store.cardList().map((c) => c.id)).toEqual(['c'])
    expect([...store.progressMap().keys()]).toEqual(['t'])
    expect(store.errorList()).toEqual([])
    expect(store.wordList()).toEqual([])
    expect(store.settings().rate).toBe(1)
    expect(store.getSync().lastSyncedAt).toBeNull()
  })
})

describe('snapshotStorage.save: size limits and quota', () => {
  it('MAX_CHARS: a snapshot above 3 000 000 chars is saved without the error log', () => {
    const u = uid()
    const big = 'x'.repeat(10_000)
    const errors = Object.fromEntries(Array.from({ length: 310 }, (_, i) => [`e${i}`, errorEntry(`e${i}`, { given: big })]))
    const p = persisted({ errors, progress: { t: progress('t', 7) }, words: { 'u:casa': word('casa', 'дом') } })
    expect(JSON.stringify(p).length).toBeGreaterThan(3_000_000)
    snapshotStorage(u).save(p)
    const stored = JSON.parse(ls.getItem(SNAP_PREFIX + u)!) as Persisted
    expect(stored.docs.errors).toEqual({})
    expect(Object.keys(stored.docs.progress)).toEqual(['t'])
    expect(Object.keys(stored.docs.words)).toEqual(['u:casa'])
  })

  it('just below MAX_CHARS the error log is kept', () => {
    const u = uid()
    const p = persisted({ errors: { e1: errorEntry('e1', { given: 'y'.repeat(1000) }) } })
    snapshotStorage(u).save(p)
    expect(Object.keys((JSON.parse(ls.getItem(SNAP_PREFIX + u)!) as Persisted).docs.errors)).toEqual(['e1'])
  })

  it('quota exceeded: retries without the error log and keeps progress, cards, words and settings', () => {
    const u = uid()
    // Throw only when the value still carries the error log.
    ls.failSetItem = (_k, v) => v.includes('"errors":{"e1"')
    const p = persisted({
      progress: { t: progress('t', 9) },
      cards: { c1: card('c1') },
      errors: { e1: errorEntry('e1') },
      words: { 'u:casa': word('casa', 'дом') },
      meta: { settings: { voice: 'male' } },
    })
    snapshotStorage(u).save(p)
    const stored = JSON.parse(ls.getItem(SNAP_PREFIX + u)!) as Persisted
    expect(stored.docs.errors).toEqual({})
    expect(Object.keys(stored.docs.cards)).toEqual(['c1'])
    expect(stored.docs.meta).toEqual({ settings: { voice: 'male' } })
    expect(ls.writes.filter((w) => w.key === SNAP_PREFIX + u)).toHaveLength(2)
  })

  it('quota exceeded even without errors: the (stale) snapshot is removed rather than kept out of date', () => {
    const u = uid()
    const s = snapshotStorage(u)
    s.save(persisted({ progress: { old: progress('old', 1) } }))
    expect(hasSnapshot(u)).toBe(true)
    ls.failSetItem = (k) => k === SNAP_PREFIX + u
    s.save(persisted({ progress: { fresh: progress('fresh', 9) } }))
    expect(ls.getItem(SNAP_PREFIX + u)).toBeNull()
    expect(s.load()).toBeNull()
  })

  it('a real-looking quota (MemoryStorage.maxChars): small snapshots still fit', () => {
    const u = uid()
    ls.maxChars = 2_000
    snapshotStorage(u).save(persisted({ errors: { e1: errorEntry('e1', { given: 'z'.repeat(3_000) }) }, progress: { t: progress('t', 6) } }))
    const stored = JSON.parse(ls.getItem(SNAP_PREFIX + u)!) as Persisted
    expect(stored.docs.errors).toEqual({})
    expect(Object.keys(stored.docs.progress)).toEqual(['t'])
  })

  it('save() is a no-op without localStorage', () => {
    const u = uid()
    removeStorage()
    expect(() => snapshotStorage(u).save(persisted())).not.toThrow()
  })

  it('save() swallows a throwing localStorage getter', () => {
    const u = uid()
    installThrowingStorage()
    expect(() => snapshotStorage(u).save(persisted())).not.toThrow()
  })
})

describe('per-uid isolation', () => {
  it('uid A snapshot is never visible to uid B (stores, load, hasSnapshot)', async () => {
    const a = uid('a')
    const b = uid('b')
    const storeA = new DataStore({ kind: 'firestore', snapshot: snapshotStorage(a), saveDelayMs: 0 })
    await storeA.upsertCards([card('secret')])
    expect(hasSnapshot(a)).toBe(true)
    expect(hasSnapshot(b)).toBe(false)
    expect(snapshotStorage(b).load()).toBeNull()
    const storeB = new DataStore({ kind: 'firestore', snapshot: snapshotStorage(b), saveDelayMs: 0 })
    expect(storeB.cardList()).toEqual([])
    expect(storeB.isReady()).toBe(false)
    await storeB.upsertCards([card('b-card')])
    expect(Object.keys(snapshotStorage(a).load()!.docs.cards)).toEqual(['secret'])
    expect(Object.keys(snapshotStorage(b).load()!.docs.cards)).toEqual(['b-card'])
  })

  it('seeded snapshots (tests/fixtures snapshotEntries) hydrate only their own uid', () => {
    const a = uid('a')
    const b = uid('b')
    applyEntries(ls, snapshotEntries({ uid: a, email: 'a@x' }, { progress: [progress('a1-ser-estar', 9)] }))
    applyEntries(ls, snapshotEntries({ uid: b, email: 'b@x' }, { cards: [card('cb')] }))
    const sa = new DataStore({ kind: 'firestore', snapshot: snapshotStorage(a) })
    const sb = new DataStore({ kind: 'firestore', snapshot: snapshotStorage(b) })
    expect(sa.progressList()).toHaveLength(1)
    expect(sa.cardList()).toHaveLength(0)
    expect(sb.progressList()).toHaveLength(0)
    expect(sb.cardList()).toHaveLength(1)
    // the cached sign-in is the last written one
    expect(readCachedUser()?.uid).toBe(b)
  })
})

describe('forgetUser (sign-out)', () => {
  it('drops the snapshot, the cached sign-in of that uid only, and notifies listeners', () => {
    const a = uid('a')
    const b = uid('b')
    snapshotStorage(a).save(persisted())
    snapshotStorage(b).save(persisted())
    writeCachedUser({ uid: b, email: 'b@x', displayName: null, photoURL: null })
    const seen: string[] = []
    const off = onForgetUser((u) => seen.push(u))
    forgetUser(a)
    expect(hasSnapshot(a)).toBe(false)
    expect(hasSnapshot(b)).toBe(true)
    expect(readCachedUser()?.uid).toBe(b) // someone else's cached sign-in stays
    forgetUser(b)
    expect(readCachedUser()).toBeNull()
    off()
    forgetUser(uid())
    expect(seen).toEqual([a, b])
  })

  it('a forgotten uid is never re-saved by its live store (debounced save pending)', () => {
    vi.useFakeTimers()
    const a = uid('a')
    const store = new DataStore({ kind: 'firestore', snapshot: snapshotStorage(a), saveDelayMs: 300 })
    void store.upsertCards([card('c1')])
    expect(hasSnapshot(a)).toBe(false) // debounced
    forgetUser(a)
    vi.advanceTimersByTime(1_000)
    store.flushSave()
    expect(hasSnapshot(a)).toBe(false)
  })

  it('forgetUser during an in-flight write: neither ack nor rollback re-creates the snapshot', async () => {
    const a = uid('a')
    const store = new DataStore({ kind: 'firestore', snapshot: snapshotStorage(a), saveDelayMs: 0 })
    const be = new FakeBackend()
    store.attach(be)
    be.serverAll({ cards: { c0: card('c0') } })
    expect(hasSnapshot(a)).toBe(true)
    await store.upsertCards([card('c1')])
    await store.upsertCards([card('c2')])
    forgetUser(a)
    expect(hasSnapshot(a)).toBe(false)
    await be.ack(0) // c1 acknowledged
    await be.fail(new Error('network'), 0) // c2 rolled back → scheduleSave
    be.sink?.remote({ col: 'cards', changes: [{ id: 'c3', data: card('c3') }], fromServer: true })
    store.flushSave()
    store.dispose()
    expect(hasSnapshot(a)).toBe(false)
  })

  it('signing in again with the same uid re-enables saving', () => {
    const a = uid('a')
    snapshotStorage(a).save(persisted())
    forgetUser(a)
    const s = snapshotStorage(a)
    s.save(persisted({ progress: { t: progress('t', 9) } }))
    expect(hasSnapshot(a)).toBe(true)
  })

  it('does not throw when storage is unavailable', () => {
    const a = uid('a')
    installThrowingStorage()
    expect(() => forgetUser(a)).not.toThrow()
  })
})

describe('cached sign-in (auth-user)', () => {
  const user = { uid: 'cached', email: 'c@x', displayName: 'C', photoURL: null }

  it('write → read → clear', () => {
    writeCachedUser(user)
    expect(readCachedUser()).toEqual(user)
    writeCachedUser(null)
    expect(ls.getItem(AUTH_USER_KEY)).toBeNull()
    expect(readCachedUser()).toBeNull()
  })

  it.each([
    ['malformed JSON', '{'],
    ['no uid', JSON.stringify({ email: 'x' })],
    ['numeric uid', JSON.stringify({ uid: 5 })],
    ['null', 'null'],
  ])('ignores %s', (_n, raw) => {
    ls.setItem(AUTH_USER_KEY, raw)
    expect(readCachedUser()).toBeNull()
  })

  it('swallows storage errors (quota on write, throwing getter)', () => {
    ls.failSetItem = () => true
    expect(() => writeCachedUser(user)).not.toThrow()
    installThrowingStorage()
    expect(() => writeCachedUser(user)).not.toThrow()
    expect(() => writeCachedUser(null)).not.toThrow()
    expect(readCachedUser()).toBeNull()
  })
})
