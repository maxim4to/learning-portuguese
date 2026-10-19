import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, X } from 'lucide-react'
import { cx } from '@/components/cx'
import { shuffle } from '../grade'
import { focusMark } from '../keyboard'
import type { ExerciseProps } from '../types'
import { isLookupOpen } from '@/features/words/capture/store'

type Side = 'L' | 'R'

/**
 * Tap a left item, then a right one (or vice versa). Wrong taps are counted as mistakes.
 * Keyboard: the grid is one Tab stop (roving tabindex); ↑/↓ move within a column, ←/→ switch columns,
 * Enter / Space selects. A matched item is disabled, so focus moves on to the next open one in its column.
 */
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
  /** Roving cursor: side + key (pair index on the left, row index on the right). */
  const [cur, setCur] = useState<{ side: Side; i: number } | null>(null)
  const refs = useRef(new Map<string, HTMLButtonElement | null>())
  const refocus = useRef<{ side: Side; i: number } | null>(null)
  const order = (side: Side) => (side === 'L' ? left.map((x) => x.i) : right.map((_, r) => r))
  const isDone = (side: Side, i: number, m = matched) =>
    side === 'L' ? m.has(i) : new Set(m.values()).has(i)
  const open = (side: Side, m = matched) => order(side).filter((i) => !isDone(side, i, m))
  const active =
    cur && !isDone(cur.side, cur.i) ? cur : open('L').length ? { side: 'L' as Side, i: open('L')[0] } : { side: 'R' as Side, i: open('R')[0] }

  useEffect(() => {
    const r = refocus.current
    if (!r) return
    refocus.current = null
    refs.current.get(r.side + r.i)?.focus()
  }, [matched])

  function moveTo(side: Side, i: number) {
    setCur({ side, i })
    refs.current.get(side + i)?.focus()
  }

  function onGridKey(e: KeyboardEvent) {
    if (isLookupOpen() || locked || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || !active) return
    const col = order(active.side)
    const row = col.indexOf(active.i)
    const openHere = open(active.side)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const down = e.key === 'ArrowDown'
      const seq = down ? [...col.slice(row + 1), ...col.slice(0, row)] : [...col.slice(0, row).reverse(), ...col.slice(row + 1).reverse()]
      const to = seq.find((i) => openHere.includes(i))
      e.preventDefault()
      if (to !== undefined) moveTo(active.side, to)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const side: Side = e.key === 'ArrowLeft' ? 'L' : 'R'
      if (side === active.side) return
      const other = order(side)
      const openThere = open(side)
      if (!openThere.length) return
      e.preventDefault()
      // Nearest open row to the current one.
      const best = openThere.reduce((a, b) => (Math.abs(other.indexOf(b) - row) < Math.abs(other.indexOf(a) - row) ? b : a))
      moveTo(side, best)
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      const to = e.key === 'Home' ? openHere[0] : openHere[openHere.length - 1]
      if (to !== undefined) moveTo(active.side, to)
    }
  }

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 700)
    return () => clearTimeout(t)
  }, [flash])

  function tryPair(l: number, rIdx: number, startSide: Side) {
    setSel(null)
    const ok = ex.pairs[l].right === right[rIdx].text
    if (!ok) {
      setFlash({ l, r: rIdx })
      setWrong((w) => [...w, `${ex.pairs[l].left} — ${right[rIdx].text}`])
      setLive(`Пара неверна: ${ex.pairs[l].left} — ${right[rIdx].text}`)
      return
    }
    const next = new Map(matched).set(l, rIdx)
    // Both items get disabled: hand focus to the first open item of the column the pair was started from
    // (keyboard rhythm: left → right → next left…), else the other column.
    const otherSide: Side = startSide === 'L' ? 'R' : 'L'
    const [first] = open(startSide, next)
    const [second] = open(otherSide, next)
    const target = first !== undefined ? { side: startSide, i: first } : second !== undefined ? { side: otherSide, i: second } : null
    if (target) {
      setCur(target)
      refocus.current = target
    }
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
    if (side === 'R') tryPair(sel.i, i, 'L')
    else tryPair(i, sel.i, 'R')
  }

  const base =
    'flex min-h-13 w-full items-center gap-2 rounded-control border-[1.5px] px-3 py-2.5 text-left text-base leading-snug transition-[background-color,border-color,transform,opacity] duration-150 active:scale-[0.98] disabled:cursor-default'
  const style = (done: boolean, selected: boolean, bad: boolean) =>
    done
      ? 'border-success-line bg-success-soft text-success opacity-75'
      : bad
        ? 'animate-shake border-danger bg-danger-soft text-danger'
        : selected
          ? 'border-ink bg-ink text-surface'
          : 'border-line-strong bg-surface hover:border-ink'

  const item = (side: Side, key: number, text: string, done: boolean, selected: boolean, bad: boolean) => (
    <li key={key}>
      <button
        ref={(el) => {
          refs.current.set(side + key, el)
        }}
        type="button"
        disabled={locked || done}
        tabIndex={active && active.side === side && active.i === key ? 0 : -1}
        aria-pressed={done ? undefined : selected}
        onFocus={() => setCur({ side, i: key })}
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
      <div className="grid grid-cols-2 gap-2 sm:gap-3" lang="pt-PT" onKeyDown={onGridKey} {...focusMark}>
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
