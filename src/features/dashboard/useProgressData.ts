import { useMemo } from 'react'
import { useCards, useDataReady, useErrors, useProgress, useStoredSettings } from '@/data'
import type { ErrorEntry, Settings, SrsCard, TopicProgress } from '@/data/types.ts'

export interface ProgressData {
  /** Only on the very first open without a device snapshot (until the first sync). */
  loading: boolean
  error: string | null
  /** topicId → progress */
  progress: Map<string, TopicProgress>
  cards: SrsCard[]
  /** Newest first. */
  errors: ErrorEntry[]
  settings: Settings | null
  /** No-op kept for callers: the store is live (local-first + listeners). */
  reload(): Promise<void>
}

const noop = async () => {}

/** Progress, cards, errors and settings from the local-first DataStore (synchronous, no fetch on mount). */
export function useProgressData(): ProgressData {
  const ready = useDataReady()
  const progress = useProgress()
  const cards = useCards()
  const errors = useErrors()
  const settings = useStoredSettings()
  return useMemo(
    () => ({ loading: !ready, error: null, progress, cards, errors, settings, reload: noop }),
    [ready, progress, cards, errors, settings],
  )
}
