import { useCallback, useMemo, useState } from 'react'
import { useCards, useDataReady, useRepository, type CardKind, type SrsCard } from '@/data'
import { createSrsCard } from '@/engine/fsrs'

/** A content item that can become an SRS card (topic example, situation phrase). The id scheme belongs to the caller. */
export interface PickSpec {
  id: string
  kind: CardKind
  /** ru */
  front: string
  /** pt-PT */
  back: string
  topicId: string
}

export type ReviewPicker = ReturnType<typeof useReviewPicker>

/**
 * Pick content items for review one by one («Добавить» / «Убрать» per row).
 * `cards` maps the specs that already are cards (null only before the first sync). Removing deletes the card with its progress.
 */
export function useReviewPicker(specs: readonly PickSpec[]) {
  const repo = useRepository()
  const all = useCards()
  const ready = useDataReady()
  const cards = useMemo(() => {
    if (!ready) return null
    const want = new Set(specs.map((s) => s.id))
    return new Map(all.filter((c) => want.has(c.id)).map((c) => [c.id, c]))
  }, [all, ready, specs])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<SrsCard | null>(null)

  const missing = useMemo(() => (cards ? specs.filter((s) => !cards.has(s.id)) : []), [cards, specs])

  const add = useCallback(
    /** Returns how many cards were created (0 when nothing was added or saving failed). */
    async (ids: readonly string[]): Promise<number> => {
      if (!cards) return 0
      const now = Date.now()
      const fresh = specs.filter((s) => ids.includes(s.id) && !cards.has(s.id)).map((s) => createSrsCard(s, now))
      if (!fresh.length) return 0
      setBusy(true)
      try {
        await repo.upsertCards(fresh)
        setMsg(null)
        return fresh.length
      } catch (e) {
        setMsg(`Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`)
        return 0
      } finally {
        setBusy(false)
      }
    },
    [cards, repo, specs],
  )

  const removeNow = useCallback(
    async (id: string) => {
      setBusy(true)
      try {
        await repo.deleteCards([id])
        setMsg(null)
      } catch (e) {
        setMsg(`Не удалось удалить: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setBusy(false)
      }
    },
    [repo],
  )

  /** Un-add: at once for a card never reviewed; a card with review history asks first (its progress is lost). */
  const remove = useCallback(
    (id: string) => {
      const c = cards?.get(id)
      if (!c) return
      if (c.fsrs.reps > 0 || c.fsrs.last_review !== undefined) setConfirm(c)
      else void removeNow(id)
    },
    [cards, removeNow],
  )

  return {
    specs,
    cards,
    missing,
    busy,
    msg,
    confirm,
    add,
    remove,
    removeNow,
    setConfirm,
  }
}

