/**
 * Snapshot of an in-progress exercise run in sessionStorage (survives reload / PWA update / leaving the page
 * within the tab session). Keyed by the runner's `persistKey`; restored only for the same exercise list.
 */
import type { AnswerRecord } from './types'

export interface RunSnapshot {
  ids: string[]
  index: number
  answers: AnswerRecord[]
  current: AnswerRecord | null
}

const key = (k: string) => `ptpt:v1:run:${k}`

export function loadRun(persistKey: string | undefined, ids: readonly string[]): RunSnapshot | null {
  if (!persistKey) return null
  try {
    const raw = sessionStorage.getItem(key(persistKey))
    if (!raw) return null
    const s = JSON.parse(raw) as RunSnapshot
    const same = s.ids.length === ids.length && s.ids.every((id, i) => id === ids[i])
    if (!same || s.index >= ids.length || (s.index === 0 && !s.current)) return null
    return s
  } catch {
    return null
  }
}

export function saveRunSnapshot(persistKey: string | undefined, s: RunSnapshot) {
  if (!persistKey) return
  try {
    sessionStorage.setItem(key(persistKey), JSON.stringify(s))
  } catch {
    // storage full / unavailable — the run just won't survive a reload
  }
}

export function clearRun(persistKey: string | undefined) {
  if (!persistKey) return
  try {
    sessionStorage.removeItem(key(persistKey))
  } catch {
    // ignore
  }
}
