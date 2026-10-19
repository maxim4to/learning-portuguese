import { useEffect, useState } from 'react'
import { shuffle } from '../grade'
import type { ExerciseProps } from '../types'

type Side = 'L' | 'R'

/** Tap a left item, then a right one (or vice versa). Wrong taps are counted as mistakes. */
export function MatchExercise({ exercise: ex, locked, onSubmit }: ExerciseProps<'match'>) {
  const [left] = useState(() => shuffle(ex.pairs.map((p, i) => ({ i, text: p.left }))))
  const [right] = useState(() => shuffle(ex.pairs.map((p, i) => ({ i, text: p.right }))))
  /** left pair index → right item index (into `right`) */
  const [matched, setMatched] = useState<Map<number, number>>(new Map())
  const [sel, setSel] = useState<{ side: Side; i: number } | null>(null)
  const [flash, setFlash] = useState<{ l: number; r: number } | null>(null)
  const [wrong, setWrong] = useState<string[]>([])
  const usedRight = new Set(matched.values())

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 600)
    return () => clearTimeout(t)
  }, [flash])

  function tryPair(l: number, rIdx: number) {
    setSel(null)
    const ok = ex.pairs[l].right === right[rIdx].text
    if (!ok) {
      setFlash({ l, r: rIdx })
      setWrong((w) => [...w, `${ex.pairs[l].left} — ${right[rIdx].text}`])
      return
    }
    const next = new Map(matched).set(l, rIdx)
    setMatched(next)
    if (next.size === ex.pairs.length) {
      const mistakes = wrong
      onSubmit({
        given: mistakes.length ? `ошибки: ${mistakes.join('; ')}` : ex.pairs.map((p) => `${p.left} — ${p.right}`).join('; '),
        verdict: mistakes.length ? 'wrong' : 'correct',
      })
    }
  }

  function tap(side: Side, i: number) {
    if (locked) return
    if (!sel || sel.side === side) {
      setSel(sel && sel.side === side && sel.i === i ? null : { side, i })
      return
    }
    if (side === 'R') tryPair(sel.i, i)
    else tryPair(i, sel.i)
  }

  const base =
    'w-full rounded-xl border px-3 py-3 text-left text-[17px] leading-snug transition active:scale-[0.98] disabled:cursor-default'
  const style = (done: boolean, selected: boolean, bad: boolean) =>
    done
      ? 'border-brand-500/50 bg-brand-50 text-brand-800 opacity-70 dark:bg-brand-800/20 dark:text-brand-100'
      : bad
        ? 'border-red-400 bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200'
        : selected
          ? 'border-brand-600 bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-800/40'
          : 'border-stone-300 bg-white hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800'

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:gap-3" lang="pt-PT">
        <ul className="space-y-2">
          {left.map(({ i, text }) => {
            const done = matched.has(i)
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={locked || done}
                  onClick={() => tap('L', i)}
                  className={`${base} ${style(done, sel?.side === 'L' && sel.i === i, flash?.l === i)}`}
                >
                  {text}
                </button>
              </li>
            )
          })}
        </ul>
        <ul className="space-y-2">
          {right.map(({ text }, rIdx) => {
            const done = usedRight.has(rIdx)
            return (
              <li key={rIdx}>
                <button
                  type="button"
                  disabled={locked || done}
                  onClick={() => tap('R', rIdx)}
                  className={`${base} ${style(done, sel?.side === 'R' && sel.i === rIdx, flash?.r === rIdx)}`}
                >
                  {text}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      {!locked && (
        <p className="text-sm text-stone-500">
          Ошибок: {wrong.length} · осталось пар: {ex.pairs.length - matched.size}
        </p>
      )}
    </div>
  )
}
