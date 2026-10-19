import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { AnswerRecord } from './types'

const ACCENTS = ['á', 'à', 'â', 'ã', 'ç', 'é', 'ê', 'í', 'ó', 'ô', 'õ', 'ú']

interface TextAnswerProps {
  /** Number of inputs (gaps); values are joined with " / ". */
  fields?: number
  locked: boolean
  result?: AnswerRecord
  placeholder?: string
  multiline?: boolean
  onSubmit(value: string): void
}

/** Typed answer: input(s) + accent keys + «Проверить» / «Не знаю». Enter submits. */
export function TextAnswer({ fields = 1, locked, result, placeholder, multiline, onSubmit }: TextAnswerProps) {
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
      ? 'border-brand-500 bg-brand-50 dark:bg-brand-800/20'
      : 'border-red-400 bg-red-50 dark:bg-red-900/20'

  const common = {
    disabled: locked,
    autoCapitalize: 'off',
    autoCorrect: 'off',
    autoComplete: 'off',
    spellCheck: false,
    lang: 'pt-PT',
    enterKeyHint: 'done' as const,
  }

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
              className={`input resize-none text-[17px] ${tone}`}
            />
          ) : (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el
              }}
              {...common}
              type="text"
              value={v}
              placeholder={fields > 1 ? `пропуск ${i + 1}` : placeholder}
              onFocus={() => setFocused(i)}
              onChange={(e) => setValues((vs) => vs.map((x, j) => (j === i ? e.target.value : x)))}
              className={`input text-[17px] ${tone}`}
            />
          ),
        )}
      </div>
      {!locked && (
        <>
          <div className="flex flex-wrap gap-1.5" aria-label="Буквы с диакритикой">
            {ACCENTS.map((ch) => (
              <button
                key={ch}
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(ch)}
                className="h-9 min-w-9 rounded-lg border border-stone-300 bg-white px-2 text-base hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800"
              >
                {ch}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={!filled}>
              Проверить
            </button>
            <button type="button" className="btn-secondary" onClick={() => onSubmit(values.join(' ').trim())}>
              Не знаю
            </button>
          </div>
        </>
      )}
    </form>
  )
}
