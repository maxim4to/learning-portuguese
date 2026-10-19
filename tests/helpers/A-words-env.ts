/**
 * Workstream A (words / srs unit tests) helpers:
 * - `MemoryStorage`: a Storage for the node environment (`vi.stubGlobal('localStorage', new MemoryStorage())`).
 * - `fakeReact`: a tiny synchronous hook runtime (useState / useEffect / createContext / useContext /
 *   useSyncExternalStore) so hook modules can be unit-tested in node without a DOM:
 *     vi.mock('react', async (orig) => ({ ...(await orig<object>()), ...(await import('../helpers/A-words-env.ts')).fakeReact }))
 *   then `renderHook(() => useSomething())`.
 * - `loadTestLexicon()`: the real generated lexicon (same as scripts/integrations.test.ts).
 * - `flush()`: drains pending promise callbacks (no timers).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createLexicon, type Lexicon, type LexiconBundle } from '../../src/engine/lexicon/lookup.ts'
import { verbForms } from '../../src/engine/lexicon/conjugate.ts'

export class MemoryStorage implements Storage {
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

/** A Storage whose every access throws (private mode / blocked site data). */
export const throwingStorage = new Proxy({} as Storage, {
  get() {
    throw new Error('storage blocked')
  },
})

let lexCache: Lexicon | null = null
export function loadTestLexicon(): Lexicon {
  if (lexCache) return lexCache
  const path = fileURLToPath(new URL('../../src/generated/lexicon.json', import.meta.url))
  lexCache = createLexicon(JSON.parse(readFileSync(path, 'utf8')) as LexiconBundle, { verbForms })
  return lexCache
}

export async function flush(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve()
}

// ─── Fake React hook runtime ────────────────────────────────────────────────

interface Slot {
  value?: unknown
  deps?: readonly unknown[]
  cleanup?: (() => void) | void
}

interface Instance {
  slots: Slot[]
  i: number
  effects: (() => void)[]
  unmounted: boolean
  renders: number
  render(): void
}

/** Shared on globalThis: a test may hold a different copy of this module than `react`'s mock (vi.resetModules). */
const rt = ((globalThis as { __aWordsHooks?: { current: Instance | null; ctx: Map<object, unknown> } }).__aWordsHooks ??= {
  current: null,
  ctx: new Map(),
})
const contextValues = rt.ctx

function inst(): Instance {
  if (!rt.current) throw new Error('hook called outside renderHook')
  return rt.current
}

function useState<T>(init: T | (() => T)): [T, (v: T | ((p: T) => T)) => void] {
  const me = inst()
  const i = me.i++
  const slot = (me.slots[i] ??= { value: typeof init === 'function' ? (init as () => T)() : init })
  const set = (v: T | ((p: T) => T)) => {
    const next = typeof v === 'function' ? (v as (p: T) => T)(slot.value as T) : v
    if (Object.is(next, slot.value)) return
    slot.value = next
    if (!me.unmounted) me.render()
  }
  return [slot.value as T, set]
}

function useEffect(fn: () => (() => void) | void, deps?: readonly unknown[]): void {
  const me = inst()
  const i = me.i++
  const prev = me.slots[i]
  const changed = !prev || !deps || !prev.deps || deps.length !== prev.deps.length || deps.some((d, k) => !Object.is(d, prev.deps![k]))
  const slot = (me.slots[i] ??= {})
  if (!changed) return
  slot.deps = deps
  me.effects.push(() => {
    if (typeof slot.cleanup === 'function') slot.cleanup()
    slot.cleanup = fn()
  })
}

function createContext<T>(defaultValue: T): { _default: T; Provider: unknown; Consumer: unknown } {
  return { _default: defaultValue, Provider: null, Consumer: null }
}

function useContext<T>(ctx: { _default: T }): T {
  return contextValues.has(ctx) ? (contextValues.get(ctx) as T) : ctx._default
}

function useSyncExternalStore<T>(subscribe: (cb: () => void) => () => void, get: () => T): T {
  if (typeof subscribe !== 'function') throw new Error('subscribe must be a function')
  return get()
}

export const fakeReact = { useState, useEffect, createContext, useContext, useSyncExternalStore }

/** Sets the value `useContext(ctx)` returns (undefined → back to the default). */
export function provideContext(ctx: unknown, value: unknown): void {
  if (value === undefined) contextValues.delete(ctx as object)
  else contextValues.set(ctx as object, value)
}

export interface HookResult<T, P> {
  readonly result: T
  readonly renders: number
  /** Re-renders; with an argument (even `undefined`) the props are replaced. */
  rerender(...props: [P?]): void
  unmount(): void
}

/** Renders a hook synchronously; effects run right after each render, setState re-renders at once. */
export function renderHook<T, P = undefined>(fn: (props: P) => T, initialProps?: P): HookResult<T, P> {
  let props = initialProps as P
  let result: T
  const me: Instance = {
    slots: [],
    i: 0,
    effects: [],
    unmounted: false,
    renders: 0,
    render() {
      me.i = 0
      me.renders++
      const prev = rt.current
      rt.current = me
      try {
        result = fn(props)
      } finally {
        rt.current = prev
      }
      for (const e of me.effects.splice(0)) e()
    },
  }
  me.render()
  return {
    get result() {
      return result
    },
    get renders() {
      return me.renders
    },
    rerender(...args: [P?]) {
      if (args.length) props = args[0] as P
      me.render()
    },
    unmount() {
      me.unmounted = true
      for (const s of me.slots) if (typeof s.cleanup === 'function') s.cleanup()
    },
  }
}
