/**
 * Per-device progress kept outside the repository, cleared by `resetProgress()` in both repositories:
 *   localStorage   ptpt:v1:srs-new:<day>   new cards introduced today (daily limit)
 *                  ptpt:v1:writing:<id>    «Письмо» drafts
 *                  (LocalRepository data: ptpt:v1:progress / cards / errors / words — cleared by the same sweep)
 *   sessionStorage ptpt:v1:run:<key>       in-progress exercise runs
 *                  ptpt:v1:diagnostic      in-progress diagnostic
 *                  ptpt:v1:logged-errors   errors already logged this tab session
 * Everything under the `ptpt:v1:` prefix goes, except preferences and sync bookkeeping: the theme and other UI
 * preferences (`KEEP`), the per-uid
 * device snapshots `ptpt:v1:snap:<uid>` (the store re-saves the current user's empty state itself) and the
 * cached sign-in `ptpt:v1:auth-user` always stay,
 * `ptpt:v1:settings` (LocalRepository settings) stays unless `resetSettings`.
 *
 * Also a tiny «progress was reset» signal for caches that live outside pages (e.g. the due badge in Layout).
 */
const PREFIX = 'ptpt:v1:'
/**
 * Per-device preferences and sign-in bookkeeping that survive a progress reset. Add new UI preferences here.
 *   theme             light / dark / system (src/app/theme)
 *   dialogue-show-ru  situation dialogues: show the Russian translation (src/features/situations/DialogueSection.tsx)
 */
const KEEP = new Set([PREFIX + 'theme', PREFIX + 'dialogue-show-ru', PREFIX + 'auth-user'])
const keepAlways = (k: string) => KEEP.has(k) || k.startsWith(PREFIX + 'snap:')
export const LOCAL_SETTINGS_KEY = PREFIX + 'settings'

function sweep(store: Storage | undefined, keep: (key: string) => boolean): void {
  if (!store) return
  try {
    const keys: string[] = []
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i)
      if (k?.startsWith(PREFIX) && !keep(k)) keys.push(k)
    }
    for (const k of keys) store.removeItem(k)
  } catch {
    // storage unavailable (private mode) — nothing to clear
  }
}

function storage(name: 'localStorage' | 'sessionStorage'): Storage | undefined {
  try {
    return (globalThis as { [k: string]: unknown })[name] as Storage | undefined
  } catch {
    return undefined
  }
}

export function clearDeviceProgress(opts: { resetSettings?: boolean } = {}): void {
  sweep(storage('localStorage'), (k) => keepAlways(k) || (!opts.resetSettings && k === LOCAL_SETTINGS_KEY))
  sweep(storage('sessionStorage'), (k) => keepAlways(k))
}

const resetListeners = new Set<() => void>()

/** Subscribe to «all progress was reset»; returns unsubscribe. */
export function onProgressReset(cb: () => void): () => void {
  resetListeners.add(cb)
  return () => {
    resetListeners.delete(cb)
  }
}

export function emitProgressReset(): void {
  for (const cb of resetListeners) cb()
}
