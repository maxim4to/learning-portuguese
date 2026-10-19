import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, ChevronDown, Clock, Copy, ExternalLink, History } from 'lucide-react'
import { cx, scrollBehavior } from '@/components/cx'
import { STATUS_LABEL } from '@/components/status'
import { useToast } from '@/components/toastContext'
import { useRepository } from '@/data'
import { useProgressMap } from '@/features/lessons/useTopicProgress'
import { copyText } from './clipboard'
import type { TutorModeDef } from './modes'
import { CLAUDE_URL, modeTitle } from './modes'
import { ASSESSMENTS, assessmentFromPct, parseScore, saveTutorSession, sessionScore, tutorHistory, type Assessment } from './persist'


/** WAI-ARIA radio group keys (as in SegmentedControl): arrows / Home / End select and move focus. */
function onRadioKeys<T extends string>(e: KeyboardEvent<HTMLElement>, values: readonly T[], current: T | null, select: (v: T) => void) {
  const i = current === null ? -1 : values.indexOf(current)
  const last = values.length - 1
  let n = -1
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = i >= last ? 0 : i + 1
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = i <= 0 ? last : i - 1
  else if (e.key === 'Home') n = 0
  else if (e.key === 'End') n = last
  if (n < 0) return
  e.preventDefault()
  select(values[n])
  e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[n]?.focus()
}

interface Props<M extends string> {
  modes: TutorModeDef[]
  /** Builds the prompt for a mode (pure; called on mode change). */
  build: (mode: M) => string
  /** Progress ids credited when the session is marked done. */
  targetIds: string[]
  /** Hide the «Все сессии» link (on the hub itself). */
  hideHubLink?: boolean
  onSaved?: () => void
}

/** Mode picker + copy / preview / «Открыть Claude» + «Отметить пройденным» with self-assessment. */
export function TutorPanel<M extends string>({ modes, build, targetIds, hideHubLink, onSaved }: Props<M>) {
  const [modeId, setModeId] = useState<M>(modes[0].id as M)
  const mode = modes.find((m) => m.id === modeId) ?? modes[0]
  const prompt = useMemo(() => build(modeId), [build, modeId])
  const [showPrompt, setShowPrompt] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)
  const toast = useToast()
  const { hash } = useLocation()

  // Deep link «…#tutor» (from the hub): Layout scrolls to the top after children mount, so wait a tick.
  useEffect(() => {
    if (hash !== '#tutor') return
    const t = window.setTimeout(() => document.getElementById('tutor')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }), 80)
    return () => window.clearTimeout(t)
  }, [hash])

  function flash(msg: string, ok = true) {
    toast({ text: msg, tone: ok ? 'success' : 'danger', duration: ok ? 2500 : 5000 })
  }

  async function onCopy() {
    if (await copyText(prompt)) {
      flash('Скопировано')
      return
    }
    // Fallback: show the prompt and select it so the user can copy manually.
    setShowPrompt(true)
    requestAnimationFrame(() => {
      const el = preRef.current
      const sel = window.getSelection()
      if (!el || !sel) return
      const range = document.createRange()
      range.selectNodeContents(el)
      sel.removeAllRanges()
      sel.addRange(range)
    })
    flash('Не удалось скопировать — текст выделен, скопируйте вручную', false)
  }

  return (
    <div className="space-y-4">
      <section className="card-raised relative space-y-5 overflow-hidden">
        <p className="text-sm text-ink-muted">
          Скопируйте промпт и вставьте его в новый чат Claude, ChatGPT или другого ассистента: он проведёт занятие по-русски на
          материале с сайта, строго в европейском варианте. После занятия отметьте его ниже — оно засчитается в прогресс.
        </p>

        <div
          role="radiogroup"
          aria-label="Формат занятия"
          className={`grid gap-2 ${modes.length > 1 ? 'sm:grid-cols-2 lg:grid-cols-3' : ''}`}
          onKeyDown={(e) => onRadioKeys(e, modes.map((m) => m.id as M), mode.id as M, setModeId)}
        >
          {modes.map((m) => {
            const on = m.id === mode.id
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setModeId(m.id as M)}
                className={cx(
                  'flex h-full flex-col gap-1.5 rounded-card border-[1.5px] p-4 text-left transition-[border-color,background-color]',
                  on ? 'border-ink bg-surface-2' : 'border-line-strong bg-surface hover:border-ink',
                )}
              >
                <span className="flex items-center gap-2.5 font-semibold">
                  <span
                    aria-hidden
                    className={cx(
                      'grid size-9 shrink-0 place-items-center rounded-full',
                      on ? 'bg-ink text-surface' : 'bg-surface-2 text-ink',
                    )}
                  >
                    <m.icon className="size-4.5" />
                  </span>
                  {m.title}
                </span>
                <span className="text-sm text-ink-muted">{m.description}</span>
                <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-semibold text-ink-muted">
                  <Clock aria-hidden className="size-3.5" /> {m.minutes}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button type="button" className="btn-primary" onClick={() => void onCopy()}>
            <Copy aria-hidden className="size-5" /> Скопировать промпт
          </button>
          <a href={CLAUDE_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary">
            Открыть Claude <ExternalLink aria-hidden className="size-4.5" />
            <span className="sr-only">(в новой вкладке)</span>
          </a>
          <button type="button" className="btn-ghost" aria-expanded={showPrompt} onClick={() => setShowPrompt((s) => !s)}>
            {showPrompt ? 'Скрыть промпт' : 'Показать промпт'}
            <ChevronDown aria-hidden className={cx('size-4.5 transition-transform', showPrompt && 'rotate-180')} />
          </button>
        </div>

        {showPrompt && (
          <div className="space-y-1">
            <pre
              ref={preRef}
              tabIndex={0}
              aria-label="Текст промпта"
              data-lookup="select"
              className="max-h-[28rem] animate-enter overflow-auto rounded-control border border-line bg-sunken p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap select-text"
            >
              {prompt}
            </pre>
            <p className="text-sm text-ink-muted">≈ {prompt.length.toLocaleString('ru-RU')} символов</p>
          </div>
        )}
      </section>

      <CompleteForm key={mode.id} mode={mode} targetIds={targetIds} hideHubLink={hideHubLink} onSaved={onSaved} />

    </div>
  )
}

function CompleteForm({
  mode,
  targetIds,
  hideHubLink,
  onSaved,
}: {
  mode: TutorModeDef
  targetIds: string[]
  hideHubLink?: boolean
  onSaved?: () => void
}) {
  const repo = useRepository()
  const { map: progress, reload } = useProgressMap()
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const msgRef = useRef<HTMLSpanElement>(null)
  // The save button is disabled once saved (no assessment): keep keyboard focus on the result line.
  useEffect(() => {
    if (msg) msgRef.current?.focus()
  }, [msg])

  const parsed = parseScore(note)
  const ids = targetIds.join('|')
  const recent = useMemo(() => {
    const own = new Set(ids.split('|'))
    const all = tutorHistory([...progress.values()].filter((p) => own.has(p.topicId)))
    // «Беседа дня» credits several items: show only previous daily sessions, not single-item ones.
    return (mode.id === 'daily' ? all.filter((r) => r.mode === 'daily') : all).slice(0, 3)
  }, [progress, ids, mode.id])

  function onNote(v: string) {
    setNote(v)
    const p = parseScore(v)
    if (p) setAssessment(assessmentFromPct(p.correct / p.total))
  }

  async function onSave() {
    if (!assessment || busy) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await saveTutorSession(repo, { targetIds, mode: mode.id, assessment, note })
      const { correct, total } = sessionScore(assessment, note)
      const status = res.length === 1 ? ` · статус: ${STATUS_LABEL[res[0].status]}` : ''
      setMsg(`Занятие засчитано: ${correct}/${total}${status}`)
      setAssessment(null)
      setNote('')
      await reload()
      onSaved?.()
    } catch (e) {
      setMsg(`Не удалось сохранить: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card space-y-4" aria-labelledby={`tutor-done-${mode.id}`}>
      <div className="space-y-0.5">
        <h3 id={`tutor-done-${mode.id}`} className="text-base font-semibold">
          Отметить пройденным
        </h3>
        <p className="text-sm text-ink-muted">«{mode.title}» — как прошло занятие?</p>
      </div>

      <div
        role="radiogroup"
        aria-label="Самооценка"
        className="grid grid-cols-3 gap-2"
        onKeyDown={(e) => onRadioKeys(e, ASSESSMENTS.map((a) => a.id), assessment, setAssessment)}
      >
        {ASSESSMENTS.map((a, i) => {
          const on = assessment === a.id
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on || (!assessment && i === 0) ? 0 : -1}
              onClick={() => setAssessment(a.id)}
              className={cx(
                'min-h-13 rounded-control border-[1.5px] px-2 py-2 text-center transition-[border-color,background-color]',
                on ? 'border-transparent bg-brand text-on-brand shadow-card' : 'border-line-strong bg-surface hover:bg-surface-2',
              )}
            >
              <span className="block text-sm font-semibold">{a.label}</span>
              <span className={cx('block text-xs tabular-nums', on ? 'opacity-85' : 'text-ink-muted')}>
                {a.score[0]}/{a.score[1]}
              </span>
            </button>
          )
        })}
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-semibold text-ink-muted">Что повторить (необязательно)</span>
        <textarea
          className="input min-h-20 w-full resize-y text-sm"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(e) => onNote(e.target.value)}
          placeholder="Например: imperfeito vs perfeito, предлоги em/a. Можно вставить строку «Итог: 8/10 · …» от агента."
        />
      </label>
      {parsed && (
        <p className="text-sm text-ink-muted">
          Найден итог агента: {parsed.correct}/{parsed.total}
          {assessment && sessionScore(assessment, note).fromNote ? ' — он и будет засчитан.' : ' — не совпадает с выбранной оценкой, засчитается самооценка.'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={!assessment || busy} onClick={() => void onSave()}>
          {busy ? 'Сохраняю…' : 'Отметить пройденным'}
        </button>
        {!assessment && <span className="text-sm text-ink-muted">Выберите самооценку</span>}
        {msg && (
          <span
            ref={msgRef}
            tabIndex={-1}
            className={cx('text-sm font-semibold outline-none', msg.startsWith('Не') ? 'text-danger' : 'text-brand-ink')}
            role="status"
          >
            {msg}
          </span>
        )}
      </div>

      {(recent.length > 0 || !hideHubLink) && (
        <div className="space-y-2 border-t border-line pt-4 text-sm">
          {recent.length > 0 && (
            <>
              <p className="flex items-center gap-1.5 font-semibold">
                <History aria-hidden className="size-4 text-ink-muted" /> Прошлые занятия с агентом
              </p>
              <ul className="space-y-1 text-ink-muted">
                {recent.map((r) => (
                  <li key={`${r.at}-${r.mode}`}>
                    {new Date(r.at).toLocaleDateString('ru-RU')} · {modeTitle(r.mode)} · {r.correct}/{r.total}
                     {r.note && <span> — {r.note.length > 90 ? `${r.note.slice(0, 89)}…` : r.note}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {!hideHubLink && (
            <p>
              <Link to="/tutor" className="inline-flex min-h-11 items-center gap-1 font-semibold">
                Все занятия с агентом и история <ArrowRight aria-hidden className="size-4" />
              </Link>
            </p>
          )}
        </div>
      )}
    </section>
  )
}
