/**
 * Component-test rendering helpers (jsdom).
 *
 *   renderWithProviders(<X />, { route, path, seed })
 *     MemoryRouter + AuthProvider (local mode → status 'disabled') + a FRESH local DataStore over seeded
 *     localStorage + WordsProvider + ToastProvider (+ WordCaptureProvider with `capture: true`).
 *     Returns RTL's result plus `store` (the DataStore: await `store.whenReady?.()`/read `store.getSync()`)
 *     and `user` (userEvent instance).
 *
 *   renderApp(path, { seed })
 *     The whole <App /> (real routes, BrowserRouter) at `path`, with module state reset (the app keeps a
 *     module-level local store singleton). Slower; prefer renderWithProviders for single components.
 */
import { render, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { ToastProvider } from '@/components/Toast'
import { AuthProvider } from '@/data/AuthProvider'
import { RepositoryContext } from '@/data/contexts'
import { LocalBackend } from '@/data/localBackend'
import { DataStore } from '@/data/store'
import { WordCaptureProvider } from '@/features/words/capture/WordCaptureProvider'
import { WordsProvider } from '@/features/words/WordsProvider'
import { applyEntries, localEntries, type Seed } from '../fixtures/seed'

export interface ProviderOptions {
  /** Initial URL (router-relative, e.g. '/topic/a1-ser-estar'). Default '/'. */
  route?: string
  /** Route pattern for `useParams`, e.g. '/topic/:id'. Default: render at any path. */
  path?: string
  seed?: Seed
  /** Wrap in WordCaptureProvider (tap/select lookup). */
  capture?: boolean
}

export function createLocalStore(seed?: Seed): DataStore {
  if (seed) applyEntries(localStorage, localEntries(seed))
  const store = new DataStore({ kind: 'local' })
  store.attach(new LocalBackend())
  return store
}

export function renderWithProviders(ui: ReactNode, opts: ProviderOptions = {}): RenderResult & { store: DataStore; user: ReturnType<typeof userEvent.setup> } {
  const store = createLocalStore(opts.seed)
  const inner = opts.capture ? <WordCaptureProvider>{ui}</WordCaptureProvider> : ui
  const tree = (
    <MemoryRouter initialEntries={[opts.route ?? '/']}>
      <AuthProvider>
        <RepositoryContext.Provider value={store}>
          <WordsProvider>
            <ToastProvider>
              <Routes>
                <Route path={opts.path ?? '*'} element={inner} />
              </Routes>
            </ToastProvider>
          </WordsProvider>
        </RepositoryContext.Provider>
      </AuthProvider>
    </MemoryRouter>
  )
  const user = userEvent.setup()
  return { ...render(tree), store, user }
}

export async function renderApp(path = '/', opts: { seed?: Seed } = {}) {
  vi.resetModules()
  if (opts.seed) applyEntries(localStorage, localEntries(opts.seed))
  window.history.pushState({}, '', path)
  const { App } = await import('@/app/App')
  const user = userEvent.setup()
  return { ...render(<App />), user }
}
