import { useMemo, type ReactNode } from 'react'
import { useDataStore } from '@/data'
import { WordsContext, WordsStore } from './useWords.ts'

/**
 * Personal dictionary view over the active DataStore (re-created when the store changes, e.g. another
 * Firestore uid). Render inside <RepositoryProvider>; use hooks from ./useWords.ts.
 */
export function WordsProvider({ children }: { children: ReactNode }) {
  const data = useDataStore()
  const store = useMemo(() => new WordsStore(data), [data])
  return <WordsContext.Provider value={store}>{children}</WordsContext.Provider>
}
