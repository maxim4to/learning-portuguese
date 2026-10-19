/**
 * Sync UI in Firebase mode, without Firebase: a firestore-kind DataStore over a fake Backend (controls the
 * sink: server batches, online/offline, listener failures, commit results), and `@/data` with
 * isFirebaseConfigured = true and a signed-in auth state for the SettingsPage account block.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ToastProvider } from '@/components/Toast'
import { RepositoryContext } from '@/data/contexts'
import { COLS, DataStore, type Backend, type BackendSink, type WriteOp } from '@/data/store'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { SyncStatusLine } from '@/features/sync/SyncStatusLine'
import { SyncToasts } from '@/features/sync/SyncToasts'
import { WordsProvider } from '@/features/words/WordsProvider'
import { NOW } from '../../fixtures/seed'

const auth = vi.hoisted(() => ({
  signOut: null as unknown as () => Promise<void>,
}))
vi.mock('@/data', async (orig) => {
  const real = await orig<typeof import('@/data')>()
  const { vi: v } = await import('vitest')
  auth.signOut = v.fn(async () => {})
  return {
    ...real,
    isFirebaseConfigured: true,
    useAuth: () => ({
      status: 'signed-in',
      user: { uid: 'uid-123', email: 'learner@example.test', displayName: null, photoURL: null },
      verified: true,
      signIn: async () => {},
      signOut: auth.signOut,
      error: null,
    }),
  }
})

class FakeBackend implements Backend {
  readonly kind = 'firestore' as const
  sink!: BackendSink
  commits: { ops: WriteOp[]; resolve(): void; reject(e: unknown): void }[] = []
  connect(sink: BackendSink) {
    this.sink = sink
    return () => {}
  }
  commit(ops: WriteOp[]) {
    return new Promise<void>((resolve, reject) => this.commits.push({ ops, resolve, reject }))
  }
  /** Every collection confirmed by the server (empty). */
  serverSync() {
    for (const col of COLS) this.sink.remote({ col, changes: [], complete: true, fromServer: true })
  }
}

let now = NOW
let store: DataStore
let backend: FakeBackend

beforeEach(() => {
  now = NOW
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  store = new DataStore({ kind: 'firestore', now: () => now, saveDelayMs: 0 })
  backend = new FakeBackend()
  store.attach(backend)
})
afterEach(() => {
  vi.useRealTimers()
})

function wrap(ui: ReactNode) {
  return render(
    <MemoryRouter>
      <RepositoryContext.Provider value={store}>
        <ToastProvider>{ui}</ToastProvider>
      </RepositoryContext.Provider>
    </MemoryRouter>,
  )
}

const statusText = () => document.querySelector('[data-sync-status]')

describe('SyncStatusLine', () => {
  test('local store → nothing', () => {
    const local = new DataStore({ kind: 'local' })
    render(
      <RepositoryContext.Provider value={local}>
        <SyncStatusLine />
      </RepositoryContext.Provider>,
    )
    expect(statusText()).toBeNull()
  })

  test('syncing → synced «только что» → «N мин назад» / «ч» / «дня» as time passes', () => {
    wrap(<SyncStatusLine />)
    expect(statusText()).toHaveAttribute('data-sync-status', 'syncing')
    expect(statusText()).toHaveTextContent('Синхронизация…')
    act(() => backend.serverSync())
    expect(statusText()).toHaveAttribute('data-sync-status', 'synced')
    expect(statusText()).toHaveTextContent('Синхронизировано · только что')
    expect(statusText()).toHaveAttribute('role', 'status')
    expect(statusText()).toHaveAttribute('aria-live', 'polite')
  })

  test('relative times: minutes, hours, days (Russian plural)', () => {
    act(() => backend.serverSync()) // lastSyncedAt = NOW
    const cases: [number, string][] = [
      [5 * 60_000, '5 мин назад'],
      [3 * 3_600_000, '3 ч назад'],
      [2 * 86_400_000, '2 дня назад'],
      [5 * 86_400_000, '5 дней назад'],
      [21 * 86_400_000, '21 день назад'],
    ]
    for (const [dt, text] of cases) {
      vi.setSystemTime(NOW + dt)
      const { unmount } = wrap(<SyncStatusLine />)
      expect(statusText()).toHaveTextContent(`Синхронизировано · ${text}`)
      unmount()
    }
  })

  test('pending writes are queued; offline keeps them and shows the last sync', () => {
    act(() => backend.serverSync())
    // The line re-reads the clock every 30 s; mount it 10 min after the last sync.
    vi.setSystemTime(NOW + 10 * 60_000)
    wrap(<SyncStatusLine />)
    act(() => {
      void store.write([{ col: 'progress', id: 'a1-ser-estar', data: { topicId: 'a1-ser-estar' } }]).catch(() => {})
    })
    expect(statusText()).toHaveTextContent('Синхронизация… · в очереди: 1')
    act(() => backend.sink.online(false))
    expect(statusText()).toHaveAttribute('data-sync-status', 'offline')
    expect(statusText()).toHaveTextContent(
      'Нет сети — изменения сохранены на устройстве и отправятся позже · в очереди: 1 · последняя 10 мин назад',
    )
  })

  test('errors: message shown, permission-denied text omitted', () => {
    wrap(<SyncStatusLine />)
    act(() => backend.sink.fail(new Error('unavailable')))
    expect(statusText()).toHaveAttribute('data-sync-status', 'error')
    expect(statusText()).toHaveTextContent(/^Ошибка синхронизации: unavailable$/)
    act(() => backend.sink.fail({ code: 'permission-denied' }))
    expect(statusText()).toHaveTextContent(/^Ошибка синхронизации$/)
  })
})

describe('SyncToasts', () => {
  test('a rejected write is rolled back and announced; permission-denied is left to <AccessDenied>', async () => {
    act(() => backend.serverSync())
    wrap(<SyncToasts />)
    let p!: Promise<void>
    act(() => {
      p = store.write([{ col: 'progress', id: 'x', data: { topicId: 'x' } }])
      p.catch(() => {})
    })
    expect(store.progressMap().has('x')).toBe(true)
    await act(async () => {
      backend.commits[0].reject(new Error('quota'))
      await p.catch(() => {})
    })
    expect(store.progressMap().has('x')).toBe(false)
    expect(screen.getByRole('status')).toHaveTextContent('Не удалось сохранить изменения — они отменены: quota')

    let q!: Promise<void>
    act(() => {
      q = store.write([{ col: 'progress', id: 'y', data: { topicId: 'y' } }])
      q.catch(() => {})
    })
    act(() => screen.getByRole('button', { name: 'Закрыть уведомление' }).click())
    await act(async () => {
      backend.commits[1].reject({ code: 'permission-denied' })
      await q.catch(() => {})
    })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})

describe('SettingsPage signed in (Firebase mode)', () => {
  test('account block: email, live sync status, «Выйти», UID copy; danger zone says «в аккаунте»', async () => {
    act(() => backend.serverSync())
    vi.useRealTimers()
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText')
    wrap(
      <WordsProvider>
        <SettingsPage />
      </WordsProvider>,
    )
    expect(screen.getByText('Прогресс синхронизируется с аккаунтом')).toBeInTheDocument()
    expect(screen.getByText('learner@example.test')).toBeInTheDocument()
    expect(statusText()).toHaveTextContent('Синхронизировано')
    expect(screen.getByText(/Хранилище:/)).toHaveTextContent('Хранилище: firestore')
    expect(screen.getByText(/в аккаунте, на всех устройствах/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Скопировать UID' }))
    expect(write).toHaveBeenCalledWith('uid-123')
    expect(await screen.findByRole('button', { name: 'Скопировано' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Скопировать UID' })).toBeInTheDocument(), { timeout: 2500 })
    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(auth.signOut).toHaveBeenCalledOnce()
  })
})
