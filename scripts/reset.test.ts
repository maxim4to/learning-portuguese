/**
 * «Сбросить весь прогресс» — LocalRepository.resetProgress + per-device keys:
 *   npx tsx --test scripts/reset.test.ts
 */
import { beforeEach, describe, test } from 'node:test'
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

const { LocalRepository } = await import('../src/data/LocalRepository.ts')
const { onProgressReset } = await import('../src/data/deviceProgress.ts')
const { DEFAULT_SETTINGS } = await import('../src/data/types.ts')
const { createSrsCard } = await import('../src/engine/fsrs.ts')

const T0 = Date.UTC(2026, 0, 1)

async function seed(repo: InstanceType<typeof LocalRepository>) {
  await repo.saveTopicResult({ topicId: 'a1-ser', correct: 8, total: 10, at: T0, source: 'lesson' })
  await repo.saveTopicResult({ topicId: 'a1-ser', correct: 5, total: 10, at: T0 + 1, source: 'diagnostic' })
  await repo.upsertCards([createSrsCard({ id: 'ph:cafe:0', kind: 'phrase', front: 'кофе', back: 'um café' }, T0)])
  await repo.upsertWords([
    { id: 'café#noun', lemma: 'café', ru: 'кофе', sources: [], modes: ['recognize'], createdAt: T0, updatedAt: T0 },
  ])
  await repo.logError({ exerciseId: 'e1', topicId: 'a1-ser', given: 'sou', expected: 'é', at: T0 })
  await repo.saveSettings({ voice: 'male', rate: 1.25, lastDiagnosticAt: T0 })
  localStorage.setItem('ptpt:v1:theme', 'dark')
  localStorage.setItem('ptpt:v1:srs-new:2026-01-01', '3')
  localStorage.setItem('ptpt:v1:writing:no-cafe', 'Olá')
  localStorage.setItem('other-app', 'x')
  sessionStorage.setItem('ptpt:v1:run:topic:a1-ser:lesson', '{}')
  sessionStorage.setItem('ptpt:v1:diagnostic', '{}')
  sessionStorage.setItem('ptpt:v1:logged-errors', '[]')
}

describe('LocalRepository.resetProgress', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  test('clears progress, cards, words, errors and device progress; keeps settings (minus lastDiagnosticAt) and theme', async () => {
    const repo = new LocalRepository()
    await seed(repo)
    assert.equal((await repo.getAllProgress()).length, 1)

    let signalled = 0
    const off = onProgressReset(() => signalled++)
    await repo.resetProgress()
    off()

    assert.equal(signalled, 1)
    assert.deepEqual(await repo.getAllProgress(), [])
    assert.deepEqual(await repo.getCards(), [])
    assert.deepEqual(await repo.getWords(), [])
    assert.deepEqual(await repo.getErrors(), [])
    const s = await repo.getSettings()
    assert.equal(s.voice, 'male')
    assert.equal(s.rate, 1.25)
    assert.equal(s.lastDiagnosticAt, undefined)

    assert.equal(localStorage.getItem('ptpt:v1:theme'), 'dark')
    assert.equal(localStorage.getItem('other-app'), 'x')
    assert.equal(localStorage.getItem('ptpt:v1:srs-new:2026-01-01'), null)
    assert.equal(localStorage.getItem('ptpt:v1:writing:no-cafe'), null)
    assert.equal(sessionStorage.length, 0)
    const left = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).sort()
    assert.deepEqual(left, ['other-app', 'ptpt:v1:settings', 'ptpt:v1:theme'])
  })

  test('resetSettings: settings back to defaults, theme still kept', async () => {
    const repo = new LocalRepository()
    await seed(repo)
    await repo.resetProgress({ resetSettings: true })
    assert.deepEqual(await repo.getSettings(), DEFAULT_SETTINGS)
    assert.equal(localStorage.getItem('ptpt:v1:settings'), null)
    assert.equal(localStorage.getItem('ptpt:v1:theme'), 'dark')
    assert.deepEqual(await repo.getCards(), [])
  })

  test('works on empty storage and data written afterwards is kept', async () => {
    const repo = new LocalRepository()
    await repo.resetProgress()
    assert.deepEqual(await repo.getSettings(), DEFAULT_SETTINGS)
    await repo.saveTopicResult({ topicId: 'a1-ser', correct: 1, total: 1, at: T0 })
    const p = await repo.getAllProgress()
    assert.equal(p.length, 1)
    assert.equal(p[0].attempts, 1)
  })
})
