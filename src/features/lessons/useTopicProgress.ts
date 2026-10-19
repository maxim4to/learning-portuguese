import { useCallback, useEffect, useState } from 'react'
import { useRepository, type TopicProgress } from '@/data'

/** All topic progress as a map (topicId → progress) + reload(). */
export function useProgressMap() {
  const repo = useRepository()
  const [map, setMap] = useState<Map<string, TopicProgress>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const reload = useCallback(async () => {
    const all = await repo.getAllProgress()
    setMap(new Map(all.map((p) => [p.topicId, p])))
    setLoaded(true)
  }, [repo])
  useEffect(() => {
    let alive = true
    repo
      .getAllProgress()
      .then((all) => {
        if (!alive) return
        setMap(new Map(all.map((p) => [p.topicId, p])))
        setLoaded(true)
      })
      .catch(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
  }, [repo])
  return { map, loaded, reload }
}
