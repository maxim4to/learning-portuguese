/**
 * Fake service-worker world for AppStatus (UpdatePrompt) tests: a registration with installing / waiting / active
 * workers, `navigator.serviceWorker` with getRegistration + listeners, and a reload detector
 * (jsdom's `location.reload` is unforgeable; it only reports «Not implemented: navigation» to stderr).
 */
import { vi } from 'vitest'

export class FakeWorker extends EventTarget {
  state: ServiceWorkerState
  postMessage = vi.fn()
  constructor(state: ServiceWorkerState = 'installed') {
    super()
    this.state = state
  }
  /** Moves to `s` and fires statechange. */
  to(s: ServiceWorkerState) {
    this.state = s
    this.dispatchEvent(new Event('statechange'))
  }
}

export interface FakeRegistration {
  installing: FakeWorker | null
  waiting: FakeWorker | null
  active: FakeWorker | null
  update: ReturnType<typeof vi.fn>
}

export interface FakeSW {
  reg: FakeRegistration | undefined
  container: {
    getRegistration: ReturnType<typeof vi.fn>
    addEventListener: ReturnType<typeof vi.fn>
    removeEventListener: ReturnType<typeof vi.fn>
  }
  /** Fires the container's `controllerchange` listeners. */
  controllerChange(): void
  restore(): void
}

export function installFakeSW(reg?: Partial<FakeRegistration>): FakeSW {
  const listeners = new Map<string, Set<() => void>>()
  const fake: FakeSW = {
    reg: reg ? { installing: null, waiting: null, active: new FakeWorker('activated'), update: vi.fn(() => Promise.resolve()), ...reg } : undefined,
    container: {
      getRegistration: vi.fn(async () => fake.reg),
      addEventListener: vi.fn((type: string, cb: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)!.add(cb)
      }),
      removeEventListener: vi.fn((type: string, cb: () => void) => listeners.get(type)?.delete(cb)),
    },
    controllerChange() {
      for (const cb of [...(listeners.get('controllerchange') ?? [])]) cb()
    },
    restore() {
      delete (navigator as unknown as Record<string, unknown>).serviceWorker
    },
  }
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: fake.container })
  return fake
}

/** Counts page reloads (jsdom reports each as «Not implemented: navigation…» on stderr). */
export function watchReloads(): { count(): number; restore(): void } {
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
    const s = String(chunk)
    if (s.includes('Not implemented: navigation')) n++
    return true
  }) as typeof process.stderr.write)
  let n = 0
  return { count: () => n, restore: () => spy.mockRestore() }
}

/** Lets pending promise callbacks run (several microtask hops). */
export async function flushPromises(times = 5) {
  for (let i = 0; i < times; i++) await Promise.resolve()
}
