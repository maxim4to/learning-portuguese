/**
 * Per-device counter of new cards introduced today (for the daily new-card limit).
 * Kept in localStorage: losing it only means the limit may be exceeded on another device.
 */
import { dayKey } from '@/features/dashboard/stats'

const key = (now: number) => `ptpt:v1:srs-new:${dayKey(now)}`

export function newSeenToday(now = Date.now()): number {
  try {
    return Number(localStorage.getItem(key(now))) || 0
  } catch {
    return 0
  }
}

export function bumpNewSeenToday(now = Date.now()): void {
  try {
    localStorage.setItem(key(now), String(newSeenToday(now) + 1))
  } catch {
    // storage unavailable — ignore
  }
}
