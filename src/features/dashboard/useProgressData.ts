import { useCallback, useEffect, useState } from 'react'
import { useRepository } from '@/data'
import type { ErrorEntry, ProgressRepository, Settings, SrsCard, TopicProgress } from '@/data/types.ts'

export interface ProgressData {
  loading: boolean
  error: string | null
  /** topicId → progress */
  progress: Map<string, TopicProgress>
  cards: SrsCard[]
  /** Newest first. */
  errors: ErrorEntry[]
  settings: Settings | null
  /** Re-reads everything from the repository. */
  reload(): Promise<void>
}

type Snapshot = Omit<ProgressData, 'reload'>

const EMPTY: Snapshot = { loading: true, error: null, progress: new Map(), cards: [], errors: [], settings: null }

async function fetchAll(repo: ProgressRepository): Promise<Snapshot> {
  try {
    const [progress, cards, errors, settings] = await Promise.all([
      repo.getAllProgress(),
      repo.getCards(),
      repo.getErrors(),
      repo.getSettings(),
    ])
    return { loading: false, error: null, progress: new Map(progress.map((p) => [p.topicId, p])), cards, errors, settings }
  } catch (e) {
    return { ...EMPTY, loading: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Loads progress, cards, errors and settings once (in parallel) from the active repository. */
export function useProgressData(): ProgressData {
  const repo = useRepository()
  const [state, setState] = useState<Snapshot>(EMPTY)

  useEffect(() => {
    let cancelled = false
    void fetchAll(repo).then((s) => {
      if (!cancelled) setState(s)
    })
    return () => {
      cancelled = true
    }
  }, [repo])

  const reload = useCallback(async () => {
    setState(await fetchAll(repo))
  }, [repo])

  return { ...state, reload }
}
