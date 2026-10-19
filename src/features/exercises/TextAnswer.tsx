import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cx } from '@/components/cx'
import type { AnswerRecord } from './types'

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

/** Typed answer: labelled input(s) + accent keys + «Проверить» / «Не знаю». Enter submits. */
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

  useEffect(() => {
    // Autofocus only on devices with a fine pointer (avoid popping the keyboard on phones).
    if (!locked && window.matchMedia?.('(pointer: fine)').matches) refs.current[0]?.focus()
  }, [locked])

  const filled = values.some((v) => v.trim())

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (locked || !filled) return
    onSubmit(values.map((v) => v.trim()).join(' / '))
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
      <div className={fields > 1 ? 'grid gap-2 sm:grid-cols-2' : ''}>
        {values.map((v, i) =>
          multiline ? (
            <textarea
              key={i}
              ref={(el) => {
                refs.current[i] = el
              }}
              {...common}
              aria-label={fieldLabel(i)}
              rows={2}
              value={v}
              placeholder={placeholder}
              onFocus={() => setFocused(i)}
              onChange={(e) => setValues((vs) => vs.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              className={cx('input resize-none text-[1.0625rem] disabled:text-ink', tone)}
            />
          ) : (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el
              }}
              {...common}
              aria-label={fieldLabel(i)}
              type="text"
              value={v}
              placeholder={fields > 1 ? `пропуск ${i + 1}` : placeholder}
              onFocus={() => setFocused(i)}
              onChange={(e) => setValues((vs) => vs.map((x, j) => (j === i ? e.target.value : x)))}
              className={cx('input text-[1.0625rem] disabled:text-ink', tone)}
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
                className="grid h-11 min-w-11 place-items-center rounded-full bg-surface-2 px-2 text-lg font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface active:scale-95"
                lang="pt-PT"
              >
                {ch}
              </button>
            ))}
          </div>
          <div className="sticky-actions -mx-2 flex gap-2 rounded-pill bg-surface/95 p-2 backdrop-blur-sm sm:static sm:mx-0 sm:bg-transparent sm:p-0">
            <button type="submit" className="btn-primary flex-1 sm:flex-none sm:min-w-36" disabled={!filled}>
              Проверить
            </button>
            {onSkip && (
              <button type="button" className="btn-secondary" onClick={onSkip}>
                Не знаю
              </button>
            )}
          </div>
        </>
      )}
    </form>
  )
}
