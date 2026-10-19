import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, useRepository, type ProgressRepository, type Settings } from '@/data'

// Many components (every play button) read settings: share one in-flight read per repo,
// re-reading at most every few seconds so changes on the settings page are picked up.
const cache = new WeakMap<ProgressRepository, { at: number; value: Promise<Settings>; resolved?: Settings }>()
const TTL = 3000

function readSettings(repo: ProgressRepository) {
  const hit = cache.get(repo)
  if (hit && Date.now() - hit.at < TTL) return hit
  const entry: { at: number; value: Promise<Settings>; resolved?: Settings } = {
    at: Date.now(),
    value: repo.getSettings().catch(() => DEFAULT_SETTINGS),
    resolved: hit?.resolved,
  }
  entry.value.then((s) => (entry.resolved = s))
  cache.set(repo, entry)
  return entry
}

/** Current user settings from the repository (last known / defaults until loaded). */
export function useSettings(): Settings {
  const repo = useRepository()
  const [settings, setSettings] = useState<Settings>(() => cache.get(repo)?.resolved ?? DEFAULT_SETTINGS)
  useEffect(() => {
    let alive = true
    readSettings(repo).value.then((s) => alive && setSettings(s))
    return () => {
      alive = false
    }
  }, [repo])
  return settings
}
