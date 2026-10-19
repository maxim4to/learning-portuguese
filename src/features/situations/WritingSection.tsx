import { useEffect, useId, useState } from 'react'
import type { Situation } from '@/content'
import { SpeakButton } from '@/features/exercises'
import { loadWriting, saveWriting } from './persist'

/** «Письмо»: task, draft (localStorage `ptpt:v1:writing:<id>`), reference sample, self-check list. */
export function WritingSection({ situation }: { situation: Situation }) {
  const task = situation.writingTask
  const [text, setText] = useState(() => loadWriting(situation.id))
  const [showSample, setShowSample] = useState(false)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [saved, setSaved] = useState(false)
  const fieldId = useId()

  // Debounced autosave.
  useEffect(() => {
    const t = setTimeout(() => {
      saveWriting(situation.id, text)
      setSaved(true)
    }, 400)
    return () => clearTimeout(t)
  }, [situation.id, text])

  if (!task) return <p className="text-stone-500">Для этой ситуации нет задания на письмо.</p>

  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <div className="space-y-4">
      <section className="card space-y-2">
        <h3 className="text-base">Задание</h3>
        <p className="whitespace-pre-line">{task.prompt}</p>
      </section>

      <section className="space-y-2">
        <label htmlFor={fieldId} className="block text-sm font-medium text-stone-700 dark:text-stone-300">
          Ваш текст
        </label>
        <textarea
          id={fieldId}
          lang="pt-PT"
          spellCheck
          rows={9}
          value={text}
          onChange={(e) => {
            setSaved(false)
            setText(e.target.value)
          }}
          placeholder="Escreva aqui…"
          className="input min-h-48 w-full resize-y leading-relaxed"
        />
        <p className="flex justify-between text-xs text-stone-500">
          <span>{text ? (saved ? 'Черновик сохранён на этом устройстве' : 'Сохраняю…') : 'Черновик сохраняется автоматически'}</span>
          <span className="tabular-nums">слов: {words}</span>
        </p>
      </section>

      <section className="card space-y-3">
        <h3 className="text-base">Проверьте себя</h3>
        <ul className="space-y-1">
          {task.checklist.map((item, i) => (
            <li key={i}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-800/60">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-brand-700"
                  checked={checked.has(i)}
                  onChange={() =>
                    setChecked((s) => {
                      const n = new Set(s)
                      if (n.has(i)) n.delete(i)
                      else n.add(i)
                      return n
                    })
                  }
                />
                <span className={checked.has(i) ? 'text-stone-500 line-through decoration-stone-400' : ''}>{item}</span>
              </label>
            </li>
          ))}
        </ul>
        {checked.size === task.checklist.length && (
          <p className="text-sm font-medium text-brand-700 dark:text-brand-500">✓ Все пункты проверены</p>
        )}
      </section>

      <section className="space-y-3">
        <button type="button" className="btn-secondary" aria-expanded={showSample} onClick={() => setShowSample((v) => !v)}>
          {showSample ? 'Скрыть образец' : 'Показать образец'}
        </button>
        {showSample && (
          <div className="card space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base">Образец</h3>
              <SpeakButton text={task.sample} label="Прослушать" />
            </div>
            <p className="leading-relaxed whitespace-pre-line" lang="pt-PT">
              {task.sample}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
