/**
 * Tiny in-memory Storage for node-env unit tests of the persist modules (stream A, features).
 *
 *   const s = installStorage('sessionStorage')            // vi.stubGlobal('sessionStorage', new MemStorage())
 *   s.failSet = true                                     // setItem throws QuotaExceededError
 *   s.failAll = true                                     // every accessor throws (blocked storage)
 *   removeStorage('localStorage')                         // global is undefined → ReferenceError-ish access paths
 *
 * Call `vi.unstubAllGlobals()` in afterEach.
 */
import { vi } from 'vitest'

export class MemStorage implements Storage {
  private map = new Map<string, string>()
  /** setItem throws a QuotaExceededError-like DOMException. */
  failSet = false
  /** Every method throws (SecurityError, e.g. blocked site data). */
  failAll = false

  private guard() {
    if (this.failAll) throw Object.assign(new Error('The operation is insecure.'), { name: 'SecurityError' })
  }
  get length() {
    this.guard()
    return this.map.size
  }
  clear() {
    this.guard()
    this.map.clear()
  }
  getItem(k: string) {
    this.guard()
    return this.map.has(k) ? this.map.get(k)! : null
  }
  key(i: number) {
    this.guard()
    return [...this.map.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.guard()
    this.map.delete(k)
  }
  setItem(k: string, v: string) {
    this.guard()
    if (this.failSet) throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' })
    this.map.set(k, String(v))
  }
  /** Raw view for assertions (bypasses fail flags). */
  dump(): Record<string, string> {
    return Object.fromEntries(this.map)
  }
}

export type StorageName = 'localStorage' | 'sessionStorage'

export function installStorage(name: StorageName, seed: Record<string, string> = {}): MemStorage {
  const s = new MemStorage()
  for (const [k, v] of Object.entries(seed)) s.setItem(k, v)
  vi.stubGlobal(name, s)
  return s
}

/** Makes the global `name` undefined (storage missing: any access throws a TypeError). */
export function removeStorage(name: StorageName): void {
  vi.stubGlobal(name, undefined)
}
