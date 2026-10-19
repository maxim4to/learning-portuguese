/**
 * src/features/srs/newCardCounter.ts — per-device «new cards today» counter in localStorage, keyed by the LOCAL day.
 * process.env.TZ cannot be changed after start, so the tests build timestamps with local Date constructors around
 * local midnight (and around DST switches when the test time zone has them — vitest runs in the machine's TZ).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { MemoryStorage, throwingStorage } from '../helpers/A-words-env.ts'
import { NOW } from '../fixtures/seed.ts'
import { bumpNewSeenToday, newSeenToday } from '@/features/srs/newCardCounter'

const local = (y: number, m: number, d: number, h = 0, min = 0, s = 0, ms = 0) => new Date(y, m, d, h, min, s, ms).getTime()

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('counter', () => {
  test('starts at 0, counts bumps for the same day', () => {
    expect(newSeenToday(NOW)).toBe(0)
    bumpNewSeenToday(NOW)
    bumpNewSeenToday(NOW + 1000)
    expect(newSeenToday(NOW)).toBe(2)
  })

  test('key format: ptpt:v1:srs-new:YYYY-MM-DD of the local date', () => {
    const t = local(2026, 0, 5, 9)
    bumpNewSeenToday(t)
    expect(localStorage.getItem('ptpt:v1:srs-new:2026-01-05')).toBe('1')
  })

  test('defaults to Date.now()', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(local(2026, 9, 19, 12))
    bumpNewSeenToday()
    expect(newSeenToday()).toBe(1)
    expect(localStorage.getItem('ptpt:v1:srs-new:2026-10-19')).toBe('1')
  })

  test('local midnight is the boundary: 23:59:59.999 and 00:00:00.000 are different days', () => {
    const before = local(2026, 9, 19, 23, 59, 59, 999)
    const after = local(2026, 9, 20)
    bumpNewSeenToday(before)
    bumpNewSeenToday(before)
    expect(newSeenToday(after)).toBe(0)
    bumpNewSeenToday(after)
    expect(newSeenToday(before)).toBe(2)
    expect(newSeenToday(after)).toBe(1)
  })

  test('month and year rollover', () => {
    bumpNewSeenToday(local(2026, 11, 31, 23, 30))
    expect(newSeenToday(local(2027, 0, 1, 0, 30))).toBe(0)
    expect(localStorage.getItem('ptpt:v1:srs-new:2026-12-31')).toBe('1')
    bumpNewSeenToday(local(2028, 1, 29, 12))
    expect(localStorage.getItem('ptpt:v1:srs-new:2028-02-29')).toBe('1')
  })

  test('DST days: the whole local day (23 h or 25 h) shares one key', () => {
    // Europe: last Sundays of March / October; America: second Sunday of March / first of November.
    for (const [y, m, d] of [
      [2026, 2, 29],
      [2026, 9, 25],
      [2026, 2, 8],
      [2026, 10, 1],
    ] as const) {
      localStorage.clear()
      const start = local(y, m, d)
      const end = local(y, m, d + 1) - 1
      bumpNewSeenToday(start)
      expect(newSeenToday(end)).toBe(1)
      expect(newSeenToday(end + 1)).toBe(0)
      const length = end + 1 - start
      // «midnight + 24 h» stays in the same local day only on a 25-hour day
      expect(newSeenToday(start + 24 * 3_600_000)).toBe(length > 24 * 3_600_000 ? 1 : 0)
    }
  })

  test('UTC vs local: a UTC midnight is not a boundary unless the zone is UTC', () => {
    const utcMidnight = Date.UTC(2026, 9, 20)
    bumpNewSeenToday(utcMidnight - 1)
    const sameLocalDay = new Date(utcMidnight - 1).getDate() === new Date(utcMidnight).getDate()
    expect(newSeenToday(utcMidnight)).toBe(sameLocalDay ? 1 : 0)
  })
})

describe('storage problems', () => {
  test('garbage values read as 0 and are overwritten by a bump', () => {
    const key = 'ptpt:v1:srs-new:2026-10-19'
    const t = local(2026, 9, 19, 12)
    for (const v of ['abc', '', 'NaN', 'null']) {
      localStorage.setItem(key, v)
      expect(newSeenToday(t)).toBe(0)
    }
    bumpNewSeenToday(t)
    expect(localStorage.getItem(key)).toBe('1')
  })

  test('blocked storage: reads 0, bump does not throw', () => {
    vi.stubGlobal('localStorage', throwingStorage)
    expect(newSeenToday(NOW)).toBe(0)
    expect(() => bumpNewSeenToday(NOW)).not.toThrow()
  })

  test('no storage at all (undefined): reads 0, bump does not throw', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(newSeenToday(NOW)).toBe(0)
    expect(() => bumpNewSeenToday(NOW)).not.toThrow()
  })

  test('setItem failing (quota) is ignored', () => {
    const s = new MemoryStorage()
    s.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError')
    }
    vi.stubGlobal('localStorage', s)
    expect(() => bumpNewSeenToday(NOW)).not.toThrow()
    expect(newSeenToday(NOW)).toBe(0)
  })
})
