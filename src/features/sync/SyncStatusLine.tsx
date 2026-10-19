import { useEffect, useState } from 'react'
import { useSyncState } from '@/data'
import { plural } from '@/features/library/format'

function ago(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} ч назад`
  return `${plural(Math.floor(h / 24), 'день', 'дня', 'дней')} назад`
}

/** «Синхронизировано · 2 мин назад» / «Синхронизация…» / «Нет сети…» — quiet status line for Settings. */
export function SyncStatusLine() {
  const sync = useSyncState()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  if (sync.status === 'local') return null
  const queued = sync.pendingWrites > 0 ? ` · в очереди: ${sync.pendingWrites}` : ''
  const since = sync.lastSyncedAt ? ` · последняя ${ago(now - sync.lastSyncedAt)}` : ''
  const text =
    sync.status === 'synced'
      ? `Синхронизировано · ${sync.lastSyncedAt ? ago(now - sync.lastSyncedAt) : 'только что'}`
      : sync.status === 'syncing'
        ? `Синхронизация…${queued}`
        : sync.status === 'offline'
          ? `Нет сети — изменения сохранены на устройстве и отправятся позже${queued}${since}`
          : `Ошибка синхронизации${sync.error && sync.error !== 'permission-denied' ? `: ${sync.error}` : ''}${since}`
  const dot =
    sync.status === 'synced' ? 'bg-brand' : sync.status === 'error' ? 'bg-danger' : sync.status === 'offline' ? 'bg-sun-fill' : 'bg-line-strong animate-pulse'
  return (
    <p className="flex items-center gap-2 text-sm text-ink-muted" role="status" aria-live="polite" data-sync-status={sync.status}>
      <i aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${dot}`} />
      {text}
    </p>
  )
}
