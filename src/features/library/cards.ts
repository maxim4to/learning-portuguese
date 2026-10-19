/** SRS cards created from the library (vocab themes, reading glossaries). */
import { useCallback, useEffect, useState } from 'react'
import type { ReadingText, VocabTheme } from '@/content'
import { useRepository, type ProgressRepository } from '@/data'
import { createSrsCard } from '@/engine/fsrs'

/** Card id of a vocab-theme word. */
export const vocabCardId = (themeId: string, index: number) => `w:${themeId}:${index}`
/** Card id of a reading-glossary word. */
export const glossaryCardId = (readingId: string, index: number) => `g:${readingId}:${index}`

export interface LibraryCardSpec {
  id: string
  /** ru */
  front: string
  /** pt-PT */
  back: string
}

export const vocabCardSpecs = (t: VocabTheme): LibraryCardSpec[] =>
  t.words.map((w, i) => ({ id: vocabCardId(t.id, i), front: w.ru, back: w.pt }))

export const glossaryCardSpecs = (r: ReadingText): LibraryCardSpec[] =>
  r.glossary.map((g, i) => ({ id: glossaryCardId(r.id, i), front: g.ru, back: g.word }))

/** Adds 'word' cards for specs that aren't cards yet (existing cards keep their FSRS state). Returns how many were added. */
export async function addLibraryCards(
  repo: ProgressRepository,
  topicId: string,
  specs: readonly LibraryCardSpec[],
): Promise<number> {
  const have = new Set((await repo.getCards()).map((c) => c.id))
  const now = Date.now()
  const fresh = specs
    .filter((s) => !have.has(s.id))
    .map((s) => createSrsCard({ id: s.id, kind: 'word', front: s.front, back: s.back, topicId }, now))
  if (fresh.length) await repo.upsertCards(fresh)
  return fresh.length
}

/**
 * Which of `specs` are already SRS cards (`have` is null until loaded) + `add(subset)`.
 * `specs` should be memoized by the caller.
 */
export function useLibraryCards(topicId: string, specs: readonly LibraryCardSpec[]) {
  const repo = useRepository()
  const [have, setHave] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const want = new Set(specs.map((s) => s.id))
    repo
      .getCards()
      .then((cards) => alive && setHave(new Set(cards.map((c) => c.id).filter((id) => want.has(id)))))
      .catch(() => alive && setHave(new Set()))
    return () => {
      alive = false
    }
  }, [repo, specs])

  const add = useCallback(
    async (subset: readonly LibraryCardSpec[], opts: { quiet?: boolean } = {}) => {
      if (!subset.length) return 0
      setBusy(true)
      try {
        const n = await addLibraryCards(repo, topicId, subset)
        setHave((prev) => new Set([...(prev ?? []), ...subset.map((s) => s.id)]))
        if (!opts.quiet) setMsg(n ? `Добавлено в повторение: ${n}` : 'Уже в повторении')
        return n
      } catch (e) {
        setMsg(`Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`)
        return 0
      } finally {
        setBusy(false)
      }
    },
    [repo, topicId],
  )

  return { have, busy, msg, add }
}
