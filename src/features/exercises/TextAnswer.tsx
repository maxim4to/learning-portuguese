import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { cx } from '@/components/cx'
import { focusMark, isImeEnter, noMods } from './keyboard'
import type { AnswerRecord } from './types'
import { isLookupOpen } from '@/features/words/capture/store'

const ACCENTS = ['á', 'à', 'â', 'ã', 'ç', 'é', 'ê', 'í', 'ó', 'ô', 'õ', 'ú']

interface TextAnswerProps {
  /** Number of inputs (gaps); values are joined with " / ". */
  fields?: number
  locked: boolean
  result?: AnswerRecord
  placeholder?: string
  multiline?: boolean
  /** Accessible name of a single field (default «Ваш ответ»). Multi-gap fields are «Пропуск N из M». */
  label?: string
  /** id(s) of the prompt / hint / translation the field answers (read by screen readers with the field). */
  describedBy?: string
  onSubmit(value: string): void
  /** «Не знаю» (shows the answer; no review card without consent). Hidden when omitted. */
  onSkip?(): void
}

/**
 * Typed answer: labelled input(s) + accent keys + «Проверить» / «Не знаю».
 * Keys: Enter checks (never during IME composition), Shift+Enter = «Не знаю». The accent keys insert at the caret
 * and never take focus from the field. Focus is moved here by the runner (`data-exercise-focus` on the first field).
 */
export function TextAnswer({
  fields = 1,
  locked,
  result,
  placeholder,
  multiline,
  label = 'Ваш ответ',
  describedBy,
  onSubmit,
  onSkip,
}: TextAnswerProps) {
  const [values, setValues] = useState<string[]>(() => Array.from({ length: fields }, () => ''))
  const [focused, setFocused] = useState(0)
  const refs = useRef<(HTMLInputElement | HTMLTextAreaElement | null)[]>([])

  const filled = values.some((v) => v.trim())

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (locked || !filled) return
    onSubmit(values.map((v) => v.trim()).join(' / '))
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, i: number) {
    if (e.key !== 'Enter' || !noMods(e)) return
    if (isLookupOpen()) {
      // Enter belongs to the word card: no implicit <form> submission behind it.
      e.preventDefault()
      return
    }
    if (isImeEnter(e)) {
      // Safari fires this Enter right after the IME committed: don't let it submit the form implicitly.
      if (!e.nativeEvent.isComposing) e.preventDefault()
      return
    }
    e.preventDefault()
    if (e.repeat) return
    if (e.shiftKey) onSkip?.()
    // Several gaps: Enter in a gap moves to the next empty one before checking.
    else if (i < fields - 1 && !values[i + 1]?.trim()) refs.current[i + 1]?.focus()
    else submit()
  }

  function insert(ch: string) {
    const el = refs.current[focused]
    if (!el) return
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    const next = el.value.slice(0, start) + ch + el.value.slice(end)
    setValues((vs) => vs.map((v, i) => (i === focused ? next : v)))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + ch.length, start + ch.length)
    })
  }

  const tone = !result
    ? ''
    : result.ok
      ? 'border-success bg-success-soft animate-pop'
      : result.skipped
        ? 'border-line-strong bg-surface-2'
        : result.verdict === 'accents'
          ? 'border-warning bg-warning-soft animate-shake'
          : 'border-danger bg-danger-soft animate-shake'

  const common = {
    disabled: locked,
    autoCapitalize: 'off',
    autoCorrect: 'off',
    autoComplete: 'off',
    spellCheck: false,
    lang: 'pt-PT',
    enterKeyHint: 'done' as const,
    'aria-describedby': describedBy,
    'aria-invalid': result && !result.ok ? true : undefined,
  }
  const fieldLabel = (i: number) => (fields > 1 ? `Пропуск ${i + 1} из ${fields}` : label)

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className={fields > 1 ? 'grid max-w-3xl gap-2 sm:grid-cols-2' : 'max-w-3xl'}>
        {values.map((v, i) =>
          multiline ? (
            <textarea
              key={i}
              ref={(el) => {
                refs.current[i] = el
              }}
              {...common}
              {...(i === 0 ? focusMark : {})}
              aria-label={fieldLabel(i)}
              rows={2}
              value={v}
              placeholder={placeholder}
              onFocus={() => setFocused(i)}
              onChange={(e) => setValues((vs) => vs.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cx('input resize-none text-base disabled:text-ink', tone)}
            />
          ) : (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el
              }}
              {...common}
              {...(i === 0 ? focusMark : {})}
              aria-label={fieldLabel(i)}
              type="text"
              value={v}
              placeholder={fields > 1 ? `пропуск ${i + 1}` : placeholder}
              onFocus={() => setFocused(i)}
              onChange={(e) => setValues((vs) => vs.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cx('input text-base disabled:text-ink', tone)}
            />
          ),
        )}
      </div>
      {!locked && (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Буквы с диакритикой">
            {ACCENTS.map((ch) => (
              <button
                key={ch}
                type="button"
                tabIndex={-1}
                aria-label={`Вставить ${ch}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(ch)}
                className="btn btn-icon bg-surface-2 font-medium text-ink hover:bg-sunken"
                lang="pt-PT"
              >
                {ch}
              </button>
            ))}
          </div>
          {/* Not sticky: a pinned bar would cover the accent keys right above it on phones. */}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1 sm:flex-none sm:min-w-36" disabled={!filled}>
              Проверить
            </button>
            {onSkip && (
              <button type="button" className="btn-secondary" onClick={onSkip} aria-keyshortcuts="Shift+Enter">
                Не знаю
              </button>
            )}
          </div>
        </>
      )}
    </form>
  )
}
