import { useCallback, useMemo, useState } from 'react'
import type { Level } from '@/content'
import { useToast } from '@/components/toastContext'
import { plural } from '@/features/library/format'
import { contentWordInput, useLexicon, type ContentWord } from './lexicon.ts'
import { useWordActions, useWordIndex, useWords } from './useWords.ts'
import { wordIdFor, wordPt, type NewWordInput } from './wordOps.ts'

/**
 * «в словарь» for a list of content words (vocab theme, situation vocab).
 * `saved[i]` — the word is in the dictionary (null until the lexicon and the dictionary are loaded;
 * saving before the dictionary is loaded could overwrite an entry with a fresh one);
 * `add(indices)` saves the missing ones in one batch and shows a toast with «Отменить».
 */
export function useContentWords(
  words: readonly ContentWord[],
  opts: { themeKey: string; src: string; indexed?: boolean; level?: Level },
) {
  const { lex, status: lexStatus } = useLexicon()
  const index = useWordIndex()
  const { saveWords } = useWordActions()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const { themeKey, src, indexed, level } = opts
  const dictStatus = useWords().status

  const inputs: NewWordInput[] | null = useMemo(
    () =>
      lexStatus === 'loading'
        ? null
        : words.map((w, i) => contentWordInput(lex, w, { themeKey, src: indexed ? `${src}:${i}` : src, level })),
    [lex, lexStatus, words, themeKey, src, indexed, level],
  )
  const ids = useMemo(() => inputs?.map((x) => wordIdFor(x)) ?? null, [inputs])
  const saved = useMemo(
    () => (dictStatus === 'ready' ? (ids?.map((id) => index.byId.has(id)) ?? null) : null),
    [ids, index, dictStatus],
  )
  const missing = useMemo(() => (saved ? saved.flatMap((s, i) => (s ? [] : [i])) : []), [saved])

  const add = useCallback(
    async (indices: readonly number[], o: { quiet?: boolean } = {}) => {
      if (!inputs || !ids || dictStatus !== 'ready') return
      const todo = [...new Set(indices)].filter((i) => !index.byId.has(ids[i]))
      if (!todo.length) return
      setBusy(true)
      try {
        const { words: saved, undo } = await saveWords(todo.map((i) => inputs[i]))
        if (o.quiet) return
        toast({
          text: saved.length === 1 ? `Добавлено в словарь: ${wordPt(saved[0])}` : `Добавлено в словарь: ${plural(saved.length, 'слово', 'слова', 'слов')}`,
          tone: 'success',
          action: { label: 'Отменить', onClick: () => void undo() },
        })
      } catch (e) {
        toast({ text: `Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`, tone: 'danger' })
      } finally {
        setBusy(false)
      }
    },
    [inputs, ids, index, dictStatus, saveWords, toast],
  )

  return { saved, missing, busy, ready: saved !== null, add, ids }
}
