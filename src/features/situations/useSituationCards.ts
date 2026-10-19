import { useCallback, useEffect, useState } from 'react'
import { useRepository } from '@/data'
import { addCards, existingCardIds, type CardSpec } from './persist'

/** Which of `specs` are already SRS cards + add(subset). `have` is null until loaded. */
export function useSituationCards(situationId: string, specs: readonly CardSpec[]) {
  const repo = useRepository()
  const [have, setHave] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    existingCardIds(repo, specs)
      .then((s) => alive && setHave(s))
      .catch(() => alive && setHave(new Set()))
    return () => {
      alive = false
    }
  }, [repo, specs])

  const add = useCallback(
    async (subset: readonly CardSpec[]) => {
      setBusy(true)
      try {
        const n = await addCards(repo, situationId, subset)
        setHave((prev) => new Set([...(prev ?? []), ...subset.map((c) => c.id)]))
        setMsg(n ? `Добавлено карточек: ${n}` : 'Уже в повторении')
      } catch (e) {
        setMsg(`Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setBusy(false)
      }
    },
    [repo, situationId],
  )

  return { have, busy, msg, add }
}
