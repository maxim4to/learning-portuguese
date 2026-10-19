/**
 * Synchronous reads from the DataStore (no per-mount fetch: the data is already in memory, from the device
 * snapshot or the live backend). Every hook re-renders only when its slice changes.
 *
 *   const progress = useProgress()        // Map<topicId, TopicProgress>
 *   const ready = useDataReady()          // false only on the very first open without a snapshot
 */
import { useSyncExternalStore } from 'react'
import { useDataStore } from './contexts.ts'
import type { DataStore, SyncState } from './store.ts'
import type { ErrorEntry, Settings, SrsCard, TopicProgress, WordEntry } from './types.ts'

function useSelect<T>(select: (s: DataStore) => T): T {
  const store = useDataStore()
  return useSyncExternalStore(store.subscribe, () => select(store))
}

/** topicId → progress (stable between unrelated updates; do not mutate). */
export const useProgress = (): Map<string, TopicProgress> => useSelect((s) => s.progressMap())
export const useCards = (): SrsCard[] => useSelect((s) => s.cardList())
/** Newest first. */
export const useErrors = (): ErrorEntry[] => useSelect((s) => s.errorList())
export const useStoredWords = (): WordEntry[] => useSelect((s) => s.wordList())
/** Settings with defaults merged. */
export const useStoredSettings = (): Settings => useSelect((s) => s.settings())
/** Data can be shown (snapshot or first sync done). Pages show skeletons only while this is false. */
export const useDataReady = (): boolean => useSelect((s) => s.isReady())
export const useSyncState = (): SyncState => useSelect((s) => s.getSync())
