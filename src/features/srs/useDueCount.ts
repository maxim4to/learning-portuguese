import { useEffect, useMemo, useRef, useState } from 'react'
import { useCards, useStoredSettings } from '@/data'
import { dueCards } from '@/engine/fsrs'
import { isDeleted } from './cardOps'
import { newSeenToday } from './newCardCounter'

/** Re-count at least this often (cards fall due with time). */
const TICK_MS = 5 * 60_000

/**
 * Cards due now (badge on «Повторение»): computed from the local-first store, so it is right on the first
 * frame and follows every card write / sync. Also re-counted after leaving /review and every few minutes.
 */
export function useDueCount(pathname: string): number {
  const cards = useCards()
  const settings = useStoredSettings()
  const [now, setNow] = useState(() => Date.now())
  const prev = useRef<string | null>(null)
  const onReview = pathname.startsWith('/review')
  useEffect(() => {
    if (prev.current?.startsWith('/review') && !onReview) setNow(Date.now())
    prev.current = pathname
  }, [pathname, onReview])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])
  return useMemo(() => {
    const live = cards.filter((c) => !isDeleted(c))
    // A card written just now (e.g. error cards after a lesson) is due «now»: never count against an older clock.
    const at = live.reduce((t, c) => Math.max(t, c.updatedAt ?? 0), now)
    return dueCards(live, at, { newPerDay: settings.newCardsPerDay, newSeenToday: newSeenToday(at) }).length
  }, [cards, settings.newCardsPerDay, now])
}
