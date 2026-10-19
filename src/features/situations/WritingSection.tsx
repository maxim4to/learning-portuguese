import { useEffect, useId, useState } from 'react'
import { useLocation } from 'react-router-dom'
import type { Situation } from '@/content'
import { CircleCheck, Eye, EyeOff } from 'lucide-react'
import { SpeakButton } from '@/components/SpeakButton'
import { Pt } from '@/features/words/Pt'
import { loadWriting, saveWriting } from './persist'

/** «Письмо»: task, draft (localStorage `ptpt:v1:writing:<id>`), reference sample, self-check list. */
export function WritingSection({ situation }: { situation: Situation }) {
  const task = situation.writingTask
  const [text, setText] = useState(() => loadWriting(situation.id))
  // A saved word's source link (`#writing-sample`) opens the sample it came from.
  const { hash } = useLocation()
  const [showSample, setShowSample] = useState(() => hash === '#writing-sample')
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

  if (!task) return <p className="text-ink-muted">Для этой ситуации нет задания на письмо.</p>

  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <div className="space-y-4">
      <section className="card space-y-2">
        <h3 className="text-base">Задание</h3>
        <p className="whitespace-pre-line">{task.prompt}</p>
      </section>

      <section className="space-y-2">
        <label htmlFor={fieldId} className="block text-sm font-semibold text-ink-muted">
          Ваш текст
        </label>
        <textarea
          id={fieldId}
          lang="pt-PT"
          spellCheck
          rows={9}
          data-lookup="off"
          value={text}
          onChange={(e) => {
            setSaved(false)
            setText(e.target.value)
          }}
          placeholder="Escreva aqui…"
          className="input min-h-48 w-full resize-y text-base leading-relaxed"
        />
        <p className="flex justify-between text-sm text-ink-muted" aria-live="polite">
          <span>{text ? (saved ? 'Черновик сохранён на этом устройстве' : 'Сохраняю…') : 'Черновик сохраняется автоматически'}</span>
          <span className="tabular-nums">слов: {words}</span>
        </p>
      </section>

      <section className="card space-y-3">
        <h3 className="text-base">Проверьте себя</h3>
        <ul className="space-y-1">
          {task.checklist.map((item, i) => (
            <li key={i}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
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
                <span className={checked.has(i) ? 'text-ink-muted line-through decoration-ink-subtle' : ''}>{item}</span>
              </label>
            </li>
          ))}
        </ul>
        {checked.size === task.checklist.length && (
          <p className="flex animate-enter items-center gap-1.5 text-sm font-semibold text-brand-ink">
            <CircleCheck aria-hidden className="size-4.5" /> Все пункты проверены
          </p>
        )}
      </section>

      <section className="space-y-3">
        <button type="button" className="btn-secondary" aria-expanded={showSample} onClick={() => setShowSample((v) => !v)}>
          {showSample ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
          {showSample ? 'Скрыть образец' : 'Показать образец'}
        </button>
        {showSample && (
          <div id="writing-sample" className="card scroll-mt-28 animate-enter space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base">Образец</h3>
              <SpeakButton text={task.sample} label="Прослушать" />
            </div>
            <Pt as="p" src={{ kind: 'situation', id: situation.id, part: 'writing' }} className="leading-relaxed whitespace-pre-line">
              {task.sample}
            </Pt>
          </div>
        )}
      </section>
    </div>
  )
}
