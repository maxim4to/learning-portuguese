import { useStoredSettings, type Settings } from '@/data'

/** Current user settings (defaults merged) from the local-first store — synchronous, live. */
export function useSettings(): Settings {
  return useStoredSettings()
}
