import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { cx } from '@/components/cx'
import { gradeTyped, shuffle } from '../grade'
import { focusMark, isInHiddenPanel, rovingIndex } from '../keyboard'
import type { ExerciseProps } from '../types'

const chip =
  'inline-flex min-h-11 items-center rounded-pill border-[1.5px] px-4 text-base leading-none transition-[background-color,border-color,transform,opacity] duration-150 active:scale-95 disabled:cursor-default'

/**
 * Tap-to-build sentence from shuffled word chips (may contain distractors).
 * Keyboard: each row (answer / bank) is one Tab stop; ←/→ move within it, ↑/↓ switch rows, Enter / Space moves the
 * focused word to the other row, Backspace removes the last word, Ctrl+Enter checks, Shift+Enter = «Не знаю».
 */
export function OrderWordsExercise({ exercise: ex, locked, result, onSubmit, onSkip }: ExerciseProps<'order-words'>) {
  const [pool] = useState(() => shuffle(ex.words.map((w, id) => ({ id, w }))))
  const [built, setBuilt] = useState<number[]>([])
  /** Roving cursors: word id in the bank, position in the answer. */
  const [bankCur, setBankCur] = useState<number | null>(null)
  const [ansCur, setAnsCur] = useState(0)
  /** Where focus goes after the next render (the chip that had it disappears). */
  const pending = useRef<{ row: 'bank'; id: number } | { row: 'ans'; pos: number } | 'check' | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const bankRefs = useRef(new Map<number, HTMLButtonElement | null>())
  const ansRefs = useRef<(HTMLButtonElement | null)[]>([])
  const checkRef = useRef<HTMLButtonElement>(null)
  const used = new Set(built)
  const sentence = built.map((id) => ex.words[id]).join(' ')
  const available = pool.filter((p) => !used.has(p.id)).map((p) => p.id)
  const bankActive = bankCur !== null && available.includes(bankCur) ? bankCur : available[0]
  const ansActive = Math.min(ansCur, Math.max(0, built.length - 1))

  function check() {
    if (locked || !built.length) return
    onSubmit(gradeTyped(sentence, [ex.answer]))
  }

  /** Bank chip → answer; focus stays in the bank on the next word (or «Проверить» when the bank is empty). */
  function pick(id: number) {
    const rest = available.filter((x) => x !== id)
    const at = available.indexOf(id)
    const nextId = rest[Math.min(at, rest.length - 1)]
    setBuilt((b) => [...b, id])
    if (nextId === undefined) pending.current = 'check'
    else {
      setBankCur(nextId)
      pending.current = { row: 'bank', id: nextId }
    }
  }

  /** Answer chip at `pos` → back to the bank; focus stays in the answer (or goes to the returned word). */
  function unpick(pos: number) {
    const id = built[pos]
    setBuilt((b) => b.filter((_, j) => j !== pos))
    if (built.length > 1) {
      const to = Math.min(pos, built.length - 2)
      setAnsCur(to)
      pending.current = { row: 'ans', pos: to }
    } else {
      setBankCur(id)
      pending.current = { row: 'bank', id }
    }
  }

  useEffect(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    const el = p === 'check' ? checkRef.current : p.row === 'bank' ? bankRefs.current.get(p.id) : ansRefs.current[p.pos]
    el?.focus()
  })

  function rowKeys(row: 'bank' | 'ans', e: ReactKeyboardEvent) {
    if (locked || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const goAns = e.key === 'ArrowUp'
      if (goAns && row === 'bank' && built.length) {
        e.preventDefault()
        ansRefs.current[ansActive]?.focus()
      } else if (!goAns && row === 'ans' && bankActive !== undefined) {
        e.preventDefault()
        bankRefs.current.get(bankActive)?.focus()
      }
      return
    }
    if (row === 'bank') {
      const to = rovingIndex(e.key, Math.max(0, available.indexOf(bankActive ?? -1)), available.length, { vertical: false })
      if (to === null) return
      e.preventDefault()
      setBankCur(available[to])
      bankRefs.current.get(available[to])?.focus()
    } else {
      const to = rovingIndex(e.key, ansActive, built.length, { vertical: false })
      if (to === null) return
      e.preventDefault()
      setAnsCur(to)
      ansRefs.current[to]?.focus()
    }
  }

  // Enter (off a chip) / Ctrl+Enter checks, Shift+Enter = «Не знаю», Backspace removes the last chip
  // (when focus isn't in a text field).
  useEffect(() => {
    if (locked) return
    const onKey = (e: KeyboardEvent) => {
      if (isInHiddenPanel(rootRef.current)) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      // A just-picked chip is disabled but keeps focus until the browser's focus fixup — treat it as no focus.
      const onButton = t?.tagName === 'BUTTON' && !(t as HTMLButtonElement).disabled
      const inside = !!t && !!rootRef.current?.contains(t)
      if (e.key === 'Enter' && !e.repeat) {
        if (e.altKey || (e.shiftKey && (e.ctrlKey || e.metaKey))) return
        if (e.shiftKey) {
          if (onButton && !inside) return
          e.preventDefault()
          onSkip?.()
        } else if (e.ctrlKey || e.metaKey) {
          e.preventDefault()
          check()
        } else if (!onButton) {
          e.preventDefault()
          check()
        }
      } else if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (onButton && !inside) return
        e.preventDefault()
        if (!built.length) return
        // The focused last chip disappears: keep focus in the answer row (or hand it to the bank).
        if (t && ansRefs.current[built.length - 1] === t) unpick(built.length - 1)
        else setBuilt((b) => b.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const tone = !result
    ? 'border-line-strong bg-sunken'
    : result.ok
      ? 'animate-pop border-success bg-success-soft'
      : result.skipped
        ? 'border-line-strong bg-surface-2'
        : 'animate-shake border-danger bg-danger-soft'

  return (
    <div ref={rootRef} className="space-y-4">
      {ex.ru && <p className="text-prompt text-pretty">{ex.ru}</p>}
      <div
        role="group"
        aria-label="Ваше предложение"
        className={cx('flex min-h-[4.25rem] flex-wrap content-start gap-2 rounded-control border-2 border-dashed p-2.5', tone)}
        lang="pt-PT"
      >
        {built.length === 0 && (
          <span className="self-center px-1 text-ink-muted" lang="ru">
            Нажимайте на слова ниже…
          </span>
        )}
        {built.map((id, i) => (
          <button
            key={id}
            ref={(el) => {
              ansRefs.current[i] = el
            }}
            type="button"
            disabled={locked}
            tabIndex={i === ansActive ? 0 : -1}
            aria-label={`${ex.words[id]} — убрать`}
            onFocus={() => setAnsCur(i)}
            onKeyDown={(e) => rowKeys('ans', e)}
            onClick={() => unpick(i)}
            className={cx(chip, 'animate-pop border-ink bg-ink text-surface')}
          >
            {ex.words[id]}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="sr-only">
        {sentence ? `Собрано: ${sentence}` : ''}
      </p>
      <div role="group" aria-label="Слова" className={cx('flex flex-wrap gap-2', locked && 'hidden')} lang="pt-PT" {...focusMark}>
        {pool.map(({ id, w }) => (
          <button
            key={id}
            ref={(el) => {
              bankRefs.current.set(id, el)
            }}
            type="button"
            disabled={locked || used.has(id)}
            tabIndex={id === bankActive ? 0 : -1}
            onFocus={() => setBankCur(id)}
            onKeyDown={(e) => rowKeys('bank', e)}
            onClick={() => pick(id)}
            className={cx(chip, 'border-line-strong bg-surface hover:border-ink', used.has(id) && 'invisible')}
          >
            {w}
          </button>
        ))}
      </div>
      {!locked && (
        <div className="sticky-actions -mx-2 flex flex-wrap gap-2 rounded-card bg-surface p-2 sm:static sm:mx-0 sm:bg-transparent sm:p-0">
          <button
            ref={checkRef}
            type="button"
            className="btn-primary flex-[1_0_auto] sm:min-w-36 sm:flex-none"
            disabled={!built.length}
            aria-keyshortcuts="Control+Enter"
            onClick={check}
          >
            Проверить
          </button>
          <button
            type="button"
            className="btn-secondary shrink-0"
            disabled={!built.length}
            onClick={() => {
              setBuilt([])
              pending.current = { row: 'bank', id: pool[0].id }
            }}
          >
            Сбросить
          </button>
          {onSkip && (
            <button type="button" className="btn-ghost shrink-0 grow sm:grow-0" onClick={onSkip} aria-keyshortcuts="Shift+Enter">
              Не знаю
            </button>
          )}
        </div>
      )}
    </div>
  )
}
