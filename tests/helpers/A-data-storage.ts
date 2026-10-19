/**
 * In-memory Web Storage for node unit tests of src/data (stream A, data).
 *
 *   const ls = installStorage()                 // fresh localStorage + sessionStorage via vi.stubGlobal
 *   ls.failSetItem = (key) => key.startsWith('ptpt:v1:snap:')   // simulate QuotaExceededError
 *   ls.maxChars = 1000                          // or a real-looking quota (sum of key+value lengths)
 *
 * Remember `vi.unstubAllGlobals()` in afterEach (or rely on `unstubGlobals` config) when a test needs to restore.
 */
import { vi } from 'vitest'

export function quotaError(): Error {
  // DOMException exists in Node ≥ 17; name/code mimic browsers.
  return new DOMException('The quota has been exceeded.', 'QuotaExceededError')
}

export class MemoryStorage implements Storage {
  readonly m = new Map<string, string>()
  /** Return true to make setItem(key) throw QuotaExceededError. */
  failSetItem: ((key: string, value: string) => boolean) | null = null
  /** Quota in characters (sum of key + value lengths); setItem beyond it throws. */
  maxChars = Infinity
  /** Every setItem call (key, value length) — for asserting what was attempted. */
  readonly writes: { key: string; length: number }[] = [];
  [name: string]: unknown

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
    const value = String(v)
    this.writes.push({ key: k, length: value.length })
    if (this.failSetItem?.(k, value)) throw quotaError()
    if (Number.isFinite(this.maxChars)) {
      let used = 0
      for (const [kk, vv] of this.m) if (kk !== k) used += kk.length + vv.length
      if (used + k.length + value.length > this.maxChars) throw quotaError()
    }
    this.m.set(k, value)
  }
  /** Plain object view (tests). */
  dump(): Record<string, string> {
    return Object.fromEntries(this.m)
  }
}

export interface InstalledStorage {
  local: MemoryStorage
  session: MemoryStorage
}

/** Installs fresh in-memory localStorage + sessionStorage on globalThis (vi.stubGlobal). */
export function installStorage(): InstalledStorage {
  const local = new MemoryStorage()
  const session = new MemoryStorage()
  vi.stubGlobal('localStorage', local)
  vi.stubGlobal('sessionStorage', session)
  return { local, session }
}

/** A globalThis.localStorage whose getter throws (Safari private mode / blocked storage). */
export function installThrowingStorage(): void {
  const thrower = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: thrower })
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get: thrower })
}

/** Removes localStorage/sessionStorage from globalThis entirely (pure node). */
export function removeStorage(): void {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: undefined })
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value: undefined })
}
