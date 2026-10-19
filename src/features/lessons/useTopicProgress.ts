import { useDataReady, useProgress } from '@/data'

const noop = async () => {}

/** All topic progress as a map (topicId → progress) from the local-first store; `reload` is a no-op (live data). */
export function useProgressMap() {
  const map = useProgress()
  const loaded = useDataReady()
  return { map, loaded, reload: noop }
}
