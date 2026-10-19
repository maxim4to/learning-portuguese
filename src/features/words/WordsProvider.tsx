import { useEffect, useMemo, type ReactNode } from 'react'
import { useRepository } from '@/data'
import { WordsContext, WordsStore } from './useWords.ts'

/**
 * Personal dictionary cache for the active repository (re-created when the repository changes,
 * e.g. another Firestore uid). Render inside <RepositoryProvider>; use hooks from ./useWords.ts.
 */
export function WordsProvider({ children }: { children: ReactNode }) {
  const repo = useRepository()
  const store = useMemo(() => new WordsStore(repo), [repo])
  useEffect(() => {
    void store.load()
  }, [store])
  return <WordsContext.Provider value={store}>{children}</WordsContext.Provider>
}
