/**
 * Local mode storage: LocalRepository (src/data/LocalRepository.ts) and LocalBackend (src/data/localBackend.ts)
 * over an in-memory localStorage — layout, malformed stored JSON, the 2000-error cap, other-tab `storage` events,
 * quota errors, import/export, reset. scripts/reset.test.ts and scripts/store.test.ts cover the happy paths.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onProgressReset } from '@/data/deviceProgress'
import { LocalBackend } from '@/data/localBackend'
import { LocalRepository } from '@/data/LocalRepository'
import { DataStore, type BackendSink, type RemoteBatch } from '@/data/store'
import { DEFAULT_SETTINGS, type ErrorEntry, type ExportBundle } from '@/data/types'
import { NOW, applyEntries, card, errorEntry, localEntries, progress, word } from '../fixtures/seed'
import { installStorage, type MemoryStorage } from '../helpers/A-data-storage'

let ls: MemoryStorage
let session: MemoryStorage

beforeEach(() => {
  ;({ local: ls, session } = installStorage())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const parse = <T>(k: string) => JSON.parse(ls.getItem(k)!) as T

describe('LocalRepository', () => {
  it('reads the seeded layout (tests/fixtures localEntries)', async () => {
    applyEntries(
      ls,
      localEntries({
        progress: [progress('a', 9)],
        cards: [card('c1')],
        words: [word('casa', 'дом')],
        errors: [errorEntry('old', { at: 1 }), errorEntry('new', { at: 2 })],
        settings: { voice: 'male' },
      }),
    )
    const repo = new LocalRepository()
    expect((await repo.getTopicProgress('a'))?.lastPct).toBe(0.9)
    expect((await repo.getAllProgress()).length).toBe(1)
    expect((await repo.getCards()).map((c) => c.id)).toEqual(['c1'])
    expect((await repo.getWords()).map((w) => w.id)).toEqual(['u:casa'])
    expect((await repo.getErrors()).map((e) => e.id)).toEqual(['new', 'old'])
    expect(await repo.getSettings()).toEqual({ ...DEFAULT_SETTINGS, voice: 'male' })
  })

  it('malformed stored JSON falls back to empty data / defaults', async () => {
    for (const k of ['progress', 'cards', 'words', 'errors', 'settings']) ls.setItem(`ptpt:v1:${k}`, '{oops')
    const repo = new LocalRepository()
    expect(await repo.getAllProgress()).toEqual([])
    expect(await repo.getCards()).toEqual([])
    expect(await repo.getWords()).toEqual([])
    expect(await repo.getErrors()).toEqual([])
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS)
    // writing over garbage works
    await repo.upsertCards([card('c1')])
    expect(Object.keys(parse<object>('ptpt:v1:cards'))).toEqual(['c1'])
  })

  it('logError keeps the newest 2000', async () => {
    const repo = new LocalRepository()
    const old = Array.from({ length: 2000 }, (_, i) => errorEntry(`e${i}`, { at: i }))
    ls.setItem('ptpt:v1:errors', JSON.stringify(old))
    const e = await repo.logError({ exerciseId: 'x', topicId: 't', given: 'a', expected: 'b', at: 5000 })
    const stored = parse<ErrorEntry[]>('ptpt:v1:errors')
    expect(stored).toHaveLength(2000)
    expect(stored[0].id).toBe('e1')
    expect(stored.at(-1)?.id).toBe(e.id)
  })

  it('empty deletes / upserts do not touch storage', async () => {
    const repo = new LocalRepository()
    await repo.deleteCards([])
    await repo.deleteWords([])
    await repo.upsertWords([])
    expect(ls.writes).toHaveLength(0)
  })

  it('saveWordBundle: sets then deletes', async () => {
    const repo = new LocalRepository()
    await repo.upsertWords([word('old', 'x')])
    await repo.upsertCards([card('lex:u:old:recognize')])
    await repo.saveWordBundle({ words: [word('casa', 'дом')], cards: [card('lex:u:casa:recognize')], deleteWordIds: ['u:old'], deleteCardIds: ['lex:u:old:recognize', 'nope'] })
    expect((await repo.getWords()).map((w) => w.id)).toEqual(['u:casa'])
    expect((await repo.getCards()).map((c) => c.id)).toEqual(['lex:u:casa:recognize'])
    await repo.saveWordBundle({})
  })

  it('saveSettings merges and returns the full object', async () => {
    const repo = new LocalRepository()
    expect(await repo.saveSettings({ rate: 0.75 })).toEqual({ ...DEFAULT_SETTINGS, rate: 0.75 })
    expect(await repo.saveSettings({ voice: 'male' })).toEqual({ ...DEFAULT_SETTINGS, rate: 0.75, voice: 'male' })
  })

  it('quota exceeded reaches the caller (nothing silently lost)', async () => {
    const repo = new LocalRepository()
    ls.failSetItem = () => true
    await expect(repo.saveTopicResult({ topicId: 't', correct: 1, total: 1, at: NOW })).rejects.toThrow(/quota/i)
    await expect(repo.upsertCards([card('a')])).rejects.toThrow()
  })

  it('resetProgress: settings without lastDiagnosticAt are left as they are; device keys swept; listeners told', async () => {
    const repo = new LocalRepository()
    await repo.saveSettings({ voice: 'male' })
    await repo.upsertCards([card('a')])
    session.setItem('ptpt:v1:run:x', '{}')
    let resets = 0
    const off = onProgressReset(() => resets++)
    await repo.resetProgress()
    off()
    expect((await repo.getSettings()).voice).toBe('male')
    expect(await repo.getCards()).toEqual([])
    expect(session.getItem('ptpt:v1:run:x')).toBeNull()
    expect(resets).toBe(1)
  })

  it('export → import into an empty device; import merges by id (incoming wins) and keeps the rest', async () => {
    const a = new LocalRepository()
    await a.saveTopicResult({ topicId: 't', correct: 9, total: 10, at: NOW })
    await a.upsertCards([card('c1')])
    await a.upsertWords([word('casa', 'дом')])
    await a.logError({ exerciseId: 'x', topicId: 't', given: 'a', expected: 'b', at: NOW })
    await a.saveSettings({ voice: 'male' })
    const bundle = await a.exportAll()
    expect(bundle.words).toHaveLength(1)

    ls.clear()
    const b = new LocalRepository()
    await b.upsertCards([card('local', { front: 'kept' })])
    await b.logError({ exerciseId: 'y', topicId: 't', given: 'a', expected: 'b', at: NOW - 1 })
    await b.importAll(JSON.stringify(bundle))
    await b.importAll(bundle) // idempotent
    expect((await b.getCards()).map((c) => c.id).sort()).toEqual(['c1', 'local'])
    expect(await b.getErrors()).toHaveLength(2)
    expect((await b.getSettings()).voice).toBe('male')
    expect((await b.getWords()).map((w) => w.id)).toEqual(['u:casa'])
    expect((await b.getAllProgress()).map((p) => p.topicId)).toEqual(['t'])
  })

  it('import of an old file without `words` keeps the device dictionary', async () => {
    const repo = new LocalRepository()
    await repo.upsertWords([word('casa', 'дом')])
    const old = { app: 'portugues-pt', version: 1, exportedAt: NOW, progress: [], cards: [], errors: [], settings: DEFAULT_SETTINGS } satisfies ExportBundle
    await repo.importAll(old)
    expect((await repo.getWords()).map((w) => w.id)).toEqual(['u:casa'])
  })

  it('import of garbage throws before writing anything', async () => {
    const repo = new LocalRepository()
    await expect(repo.importAll('<html>')).rejects.toThrow()
    await expect(repo.importAll(JSON.stringify({ app: 'x', version: 1 }))).rejects.toThrow(/Português PT/)
    expect(ls.writes).toHaveLength(0)
  })
})

/** Collects what the backend delivers. */
function sink() {
  const batches: RemoteBatch[] = []
  const s: BackendSink & { batches: RemoteBatch[] } = { batches, remote: (b) => batches.push(b), online: () => {}, fail: () => {} }
  return s
}

describe('LocalBackend', () => {
  type Handler = (e: { key: string | null; storageArea: unknown }) => void
  let handlers: Handler[]
  beforeEach(() => {
    handlers = []
    vi.stubGlobal('addEventListener', (_t: string, fn: Handler) => handlers.push(fn))
    vi.stubGlobal('removeEventListener', (_t: string, fn: Handler) => (handlers = handlers.filter((h) => h !== fn)))
  })

  it('connect delivers every collection synchronously as a complete server listing (errors array → id map)', () => {
    applyEntries(ls, localEntries({ errors: [errorEntry('e1')], settings: { voice: 'male' }, cards: [card('c')] }))
    const s = sink()
    new LocalBackend().connect(s)
    expect(s.batches.map((b) => b.col)).toEqual(['progress', 'cards', 'errors', 'words', 'meta'])
    expect(s.batches.every((b) => b.complete && b.fromServer)).toBe(true)
    expect(s.batches[2].changes.map((c) => c.id)).toEqual(['e1'])
    expect(s.batches[4].changes).toEqual([{ id: 'settings', data: { voice: 'male' } }])
  })

  it('malformed stored JSON is delivered as empty collections', () => {
    for (const k of ['progress', 'cards', 'words', 'errors', 'settings']) ls.setItem(`ptpt:v1:${k}`, 'nope{')
    const s = sink()
    new LocalBackend().connect(s)
    expect(s.batches.every((b) => b.changes.length === 0)).toBe(true)
  })

  // BUG A-11: see docs/testing-bugs/A.md — read() only guards JSON.parse; a parseable value of the wrong shape
  // (errors stored as an object, a collection stored as `null`) throws in readCol → connect → attach (white screen).
  it.fails('wrong shapes (errors as an object, progress as null) do not break connect', () => {
    ls.setItem('ptpt:v1:errors', '{"a":1}')
    ls.setItem('ptpt:v1:progress', 'null')
    const s = sink()
    expect(() => new LocalBackend().connect(s)).not.toThrow()
  })

  it('commit: errors sorted by time and capped at 2000; empty collections / missing settings remove their keys', async () => {
    const be = new LocalBackend()
    const many = Array.from({ length: 2001 }, (_, i) => ({ col: 'errors' as const, id: `e${i}`, data: errorEntry(`e${i}`, { at: 3000 - i }) }))
    await be.commit(many)
    const stored = parse<ErrorEntry[]>('ptpt:v1:errors')
    expect(stored).toHaveLength(2000)
    expect(stored[0].at).toBeLessThan(stored[1].at)
    expect(stored.map((e) => e.id)).not.toContain('e2000') // the oldest went

    await be.commit([{ col: 'cards', id: 'a', data: card('a') }, { col: 'meta', id: 'settings', data: { voice: 'male' } }])
    expect(ls.getItem('ptpt:v1:cards')).not.toBeNull()
    expect(parse<object>('ptpt:v1:settings')).toEqual({ voice: 'male' })
    await be.commit([{ col: 'cards', id: 'a', data: null }, { col: 'meta', id: 'settings', data: null }])
    expect(ls.getItem('ptpt:v1:cards')).toBeNull()
    expect(ls.getItem('ptpt:v1:settings')).toBeNull()
  })

  it('other tabs: a storage event for one key re-delivers that collection; key=null (clear) re-delivers all', () => {
    const s = sink()
    const stop = new LocalBackend().connect(s)
    expect(handlers).toHaveLength(1)
    s.batches.length = 0
    ls.setItem('ptpt:v1:words', JSON.stringify({ 'u:casa': word('casa', 'дом') }))
    handlers[0]({ key: 'ptpt:v1:words', storageArea: ls })
    expect(s.batches.map((b) => b.col)).toEqual(['words'])
    handlers[0]({ key: 'ptpt:v1:theme', storageArea: ls }) // not a data key
    handlers[0]({ key: 'ptpt:v1:words', storageArea: session }) // sessionStorage of another tab
    expect(s.batches).toHaveLength(1)
    handlers[0]({ key: null, storageArea: ls })
    expect(s.batches).toHaveLength(6)
    handlers[0]({ key: 'ptpt:v1:settings', storageArea: null })
    expect(s.batches.at(-1)?.col).toBe('meta')
    stop()
    expect(handlers).toHaveLength(0)
  })

  it('without window events (pure node) connect/stop still work', () => {
    vi.stubGlobal('addEventListener', undefined)
    vi.stubGlobal('removeEventListener', undefined)
    const stop = new LocalBackend().connect(sink())
    expect(() => stop()).not.toThrow()
  })

  it('a store on LocalBackend sees another tab’s write and a «clear» from another tab', () => {
    applyEntries(ls, localEntries({ cards: [card('a')] }))
    const store = new DataStore({ kind: 'local' })
    store.attach(new LocalBackend())
    expect(store.cardList().map((c) => c.id)).toEqual(['a'])
    ls.setItem('ptpt:v1:cards', JSON.stringify({ a: card('a'), b: card('b') }))
    handlers[0]({ key: 'ptpt:v1:cards', storageArea: ls })
    expect(store.cardList().map((c) => c.id)).toEqual(['a', 'b'])
    ls.clear()
    handlers[0]({ key: null, storageArea: ls })
    expect(store.cardList()).toEqual([])
    expect(store.isReady()).toBe(true)
  })

  it('a local store writes the LocalRepository layout that LocalRepository reads back', async () => {
    const store = new DataStore({ kind: 'local' })
    store.attach(new LocalBackend())
    await store.saveTopicResult({ topicId: 't', correct: 3, total: 4, at: NOW })
    await store.logError({ exerciseId: 'x', topicId: 't', given: 'a', expected: 'b', at: NOW })
    await store.saveSettings({ rate: 1.25 })
    await store.upsertWords([word('casa', 'дом')])
    const repo = new LocalRepository()
    expect((await repo.getTopicProgress('t'))?.lastPct).toBe(0.75)
    expect(await repo.getErrors()).toHaveLength(1)
    expect((await repo.getSettings()).rate).toBe(1.25)
    expect(await repo.getWords()).toHaveLength(1)
  })
})
