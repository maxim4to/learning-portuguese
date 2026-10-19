import { useEffect, useRef, useState } from 'react'
import { gradeTyped, shuffle } from '../grade'
import { isInHiddenPanel } from '../keyboard'
import type { ExerciseProps } from '../types'

const chip =
  'rounded-xl border px-3 py-2 text-[17px] leading-none transition active:scale-95 disabled:cursor-default'

/** Tap-to-build sentence from shuffled word chips (may contain distractors). */
export function OrderWordsExercise({ exercise: ex, locked, result, onSubmit }: ExerciseProps<'order-words'>) {
  const [pool] = useState(() => shuffle(ex.words.map((w, id) => ({ id, w }))))
  const [built, setBuilt] = useState<number[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const used = new Set(built)
  const sentence = built.map((id) => ex.words[id]).join(' ')

  function check() {
    if (locked || !built.length) return
    onSubmit(gradeTyped(sentence, [ex.answer]))
  }

  // Enter checks, Backspace removes the last chip (when focus isn't in a text field).
  useEffect(() => {
    if (locked) return
    const onKey = (e: KeyboardEvent) => {
      if (isInHiddenPanel(rootRef.current)) return
      const t = e.target as HTMLElement | null
      // A just-picked chip is disabled but keeps focus until the browser's focus fixup — treat it as no focus.
      const activeButton = t?.tagName === 'BUTTON' && !(t as HTMLButtonElement).disabled
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || activeButton)) {
        if (!(activeButton && e.key === 'Backspace')) return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        check()
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        setBuilt((b) => b.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const tone = !result
    ? 'border-stone-300 dark:border-stone-700'
    : result.ok
      ? 'border-brand-500 bg-brand-50 dark:bg-brand-800/20'
      : 'border-red-400 bg-red-50 dark:bg-red-900/20'

  return (
    <div ref={rootRef} className="space-y-4">
      {ex.ru && <p className="text-xl">{ex.ru}</p>}
      <div
        className={`flex min-h-16 flex-wrap content-start gap-2 rounded-xl border-2 border-dashed p-2.5 ${tone}`}
        aria-label="Ваше предложение"
        lang="pt-PT"
      >
        {built.length === 0 && <span className="self-center px-1 text-stone-400">Нажимайте на слова ниже…</span>}
        {built.map((id, i) => (
          <button
            key={id}
            type="button"
            disabled={locked}
            onClick={() => setBuilt((b) => b.filter((_, j) => j !== i))}
            className={`${chip} border-brand-600/40 bg-brand-50 text-brand-900 dark:bg-brand-800/30 dark:text-brand-100`}
          >
            {ex.words[id]}
          </button>
        ))}
      </div>
      <div className={`flex flex-wrap gap-2 ${locked ? 'hidden' : ''}`} lang="pt-PT">
        {pool.map(({ id, w }) => (
          <button
            key={id}
            type="button"
            disabled={locked || used.has(id)}
            onClick={() => setBuilt((b) => [...b, id])}
            className={`${chip} border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-30 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800 ${used.has(id) ? 'invisible' : ''}`}
          >
            {w}
          </button>
        ))}
      </div>
      {!locked && (
        <div className="flex gap-2">
          <button type="button" className="btn-primary flex-1 sm:flex-none" disabled={!built.length} onClick={check}>
            Проверить
          </button>
          <button type="button" className="btn-secondary" disabled={!built.length} onClick={() => setBuilt([])}>
            Сбросить
          </button>
        </div>
      )}
    </div>
  )
}
