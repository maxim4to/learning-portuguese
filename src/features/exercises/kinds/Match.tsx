import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { cx } from '@/components/cx'
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
  const [live, setLive] = useState('')
  const usedRight = new Set(matched.values())

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 700)
    return () => clearTimeout(t)
  }, [flash])

  function tryPair(l: number, rIdx: number) {
    setSel(null)
    const ok = ex.pairs[l].right === right[rIdx].text
    if (!ok) {
      setFlash({ l, r: rIdx })
      setWrong((w) => [...w, `${ex.pairs[l].left} — ${right[rIdx].text}`])
      setLive(`Пара неверна: ${ex.pairs[l].left} — ${right[rIdx].text}`)
      return
    }
    const next = new Map(matched).set(l, rIdx)
    setMatched(next)
    setLive(`Верно: ${ex.pairs[l].left} — ${right[rIdx].text}. Осталось пар: ${ex.pairs.length - next.size}`)
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
    'flex min-h-12 w-full items-center gap-2 rounded-control border-[1.5px] px-3 py-2.5 text-left text-[1.0625rem] leading-snug transition-[background-color,border-color,transform,opacity] duration-150 active:scale-[0.98] disabled:cursor-default'
  const style = (done: boolean, selected: boolean, bad: boolean) =>
    done
      ? 'border-brand/40 bg-brand-soft text-brand-ink opacity-75'
      : bad
        ? 'animate-shake border-danger bg-danger-soft text-danger'
        : selected
          ? 'border-azulejo bg-azulejo-soft text-azulejo-ink ring-2 ring-azulejo/40'
          : 'border-line-strong bg-surface hover:border-azulejo/60 hover:bg-surface-2'

  const item = (side: Side, key: number, text: string, done: boolean, selected: boolean, bad: boolean) => (
    <li key={key}>
      <button
        type="button"
        disabled={locked || done}
        aria-pressed={done ? undefined : selected}
        onClick={() => tap(side, key)}
        className={cx(base, style(done, selected, bad))}
      >
        <span className="flex-1">{text}</span>
        {done && <Check aria-hidden className="size-4 shrink-0" strokeWidth={3} />}
        {bad && <X aria-hidden className="size-4 shrink-0" strokeWidth={3} />}
        {done && <span className="sr-only" lang="ru">— сопоставлено</span>}
      </button>
    </li>
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:gap-3" lang="pt-PT">
        <ul className="space-y-2" aria-label="Левый столбец">
          {left.map(({ i, text }) => item('L', i, text, matched.has(i), sel?.side === 'L' && sel.i === i, flash?.l === i))}
        </ul>
        <ul className="space-y-2" aria-label="Правый столбец">
          {right.map(({ text }, rIdx) =>
            item('R', rIdx, text, usedRight.has(rIdx), sel?.side === 'R' && sel.i === rIdx, flash?.r === rIdx),
          )}
        </ul>
      </div>
      {!locked && (
        <p className="text-sm text-ink-muted tabular-nums">
          Ошибок: {wrong.length} · осталось пар: {ex.pairs.length - matched.size}
        </p>
      )}
      <div aria-live="polite" className="sr-only">
        {live}
      </div>
    </div>
  )
}
