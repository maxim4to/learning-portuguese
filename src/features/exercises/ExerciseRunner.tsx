import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Check, History } from 'lucide-react'
import type { Exercise } from '@/content'
import { ProgressBar } from '@/components/ProgressBar'
import { cx, haptic, scrollBehavior } from '@/components/cx'
import { exerciseExpected, exerciseHeading } from './describe'
import { ExerciseFeedback } from './ExerciseFeedback'
import { feedbackSummary } from './feedbackText'
import { clearRun, loadRun, saveRunSnapshot } from './runPersist'
import { focusPrimary, hasFinePointer, isInHiddenPanel, noMods } from './keyboard'
import { ChoiceExercise, ListenChoiceExercise } from './kinds/Choice'
import { FillGapExercise } from './kinds/FillGap'
import { ListenTypeExercise } from './kinds/ListenType'
import { MatchExercise } from './kinds/Match'
import { OrderWordsExercise } from './kinds/OrderWords'
import { SpeakShadowExercise } from './kinds/SpeakShadow'
import { TransformExercise } from './kinds/Transform'
import { TranslateRuPtExercise } from './kinds/TranslateRuPt'
import type { AnswerRecord, RunSummary, Submission } from './types'
import { useSettings } from './useSettings'
import { isLookupOpen } from '@/features/words/capture/store'
import { lookupAttrs } from '@/features/words/source'

export interface ExerciseRunnerProps {
  exercises: readonly Exercise[]
  /** Called after «Дальше» on the last exercise. */
  onFinish(summary: RunSummary): void
  title?: string
  /**
   * Stable id of this run (e.g. `topic:<id>:lesson`): progress is kept in sessionStorage under it,
   * so a reload / PWA update resumes the run. Omit to disable.
   */
  persistKey?: string
  /**
   * Started by a click whose button unmounts («Начать», «Пройти заново», next stage…): focus the first task
   * heading on mount if focus fell to <body>. Leave off for runs that are simply on the page at load.
   */
  focusOnMount?: boolean
  /** Desktop side panel (progress through the items, what is trained, keys). Off where the runner sits in a narrow column. */
  panel?: boolean
  /**
   * Word lookup after the answer is checked (before it, lookup is always off). Off for the diagnostic: it measures
   * the level, so no translations at any point.
   */
  lookup?: boolean
}

/** Keyboard hint for the side panel: what the keys do in this kind of task (then Enter → next everywhere). */
const KIND_KEYS: Record<Exercise['type'], [string, string][]> = {
  'fill-gap': [['Enter', 'проверить'], ['Shift+Enter', '«Не знаю»']],
  transform: [['Enter', 'проверить'], ['Shift+Enter', '«Не знаю»']],
  'translate-ru-pt': [['Enter', 'проверить'], ['Shift+Enter', '«Не знаю»']],
  'listen-type': [['Enter', 'проверить'], ['Shift+Enter', '«Не знаю»'], ['Shift+Tab', 'к «Слушать»']],
  choice: [['↑ ↓', 'выбрать вариант'], ['Enter, 1–9', 'ответить']],
  'listen-choice': [['Enter', 'слушать'], ['1–9', 'ответить'], ['Tab, ↑ ↓', 'к вариантам']],
  'order-words': [
    ['← → ↑ ↓', 'по словам'],
    ['Enter', 'переставить слово'],
    ['Backspace', 'убрать последнее'],
    ['Ctrl+Enter', 'проверить'],
    ['Shift+Enter', '«Не знаю»'],
  ],
  match: [['← → ↑ ↓', 'по карточкам'], ['Enter', 'выбрать']],
  'speak-shadow': [['Enter', 'слушать'], ['Tab', 'к оценке']],
}

const kbd = 'rounded-md bg-surface-2 px-1.5 py-0.5 font-sans text-xs font-bold text-ink whitespace-nowrap'

/** Keyboard-activated «Дальше» clicks this soon after answering are ignored (held / bounced Enter). */
const NEXT_GUARD_MS = 250
/**
 * After «Дальше» the next task takes its place under the pointer: the rest of a double click / double tap (and a
 * held Enter) must not answer it. Clicks of a multi-click (detail > 1) are ignored this long after «Дальше»,
 * touch taps — for TAP_GUARD_MS; a held Enter is dropped as key repeat.
 */
const DOUBLE_CLICK_GUARD_MS = 600
const TAP_GUARD_MS = 350

/** Generic name of each exercise kind (the side panel groups the run by it). */
const KIND_LABEL: Record<Exercise['type'], string> = {
  'fill-gap': 'Вставить пропущенное',
  choice: 'Выбрать вариант',
  transform: 'Преобразовать фразу',
  'order-words': 'Составить предложение',
  'translate-ru-pt': 'Перевести на португальский',
  'listen-type': 'Записать на слух',
  'listen-choice': 'Выбрать на слух',
  match: 'Соединить пары',
  'speak-shadow': 'Повторить вслух',
}

export function ExerciseView(props: {
  exercise: Exercise
  locked: boolean
  result?: AnswerRecord
  onSubmit(s: Submission): void
  onSkip(): void
}): ReactNode {
  const { exercise: ex, ...rest } = props
  switch (ex.type) {
    case 'fill-gap':
      return <FillGapExercise exercise={ex} {...rest} />
    case 'choice':
      return <ChoiceExercise exercise={ex} {...rest} />
    case 'transform':
      return <TransformExercise exercise={ex} {...rest} />
    case 'order-words':
      return <OrderWordsExercise exercise={ex} {...rest} />
    case 'translate-ru-pt':
      return <TranslateRuPtExercise exercise={ex} {...rest} />
    case 'listen-type':
      return <ListenTypeExercise exercise={ex} {...rest} />
    case 'listen-choice':
      return <ListenChoiceExercise exercise={ex} {...rest} />
    case 'match':
      return <MatchExercise exercise={ex} {...rest} />
    case 'speak-shadow':
      return <SpeakShadowExercise exercise={ex} {...rest} />
  }
}

/**
 * Runs a list of exercises one by one: progress bar, per-type UI, grading (honours
 * settings.lenientAccents), feedback with the correct answer + explanation, «Дальше».
 * Keyboard (see KIND_KEYS): Enter checks typed answers, Shift+Enter = «Не знаю», arrows / 1–9 pick options,
 * then Enter → next. Focus: after answering — «Дальше» (the verdict is announced by the live region); after «Дальше» —
 * the new task's primary control (text field, option group, word bank…), so the whole run works without a mouse.
 * Give it a `key` to restart with a new list.
 */
export function ExerciseRunner({ exercises, onFinish, title, persistKey, focusOnMount, panel = true, lookup = true }: ExerciseRunnerProps) {
  const { lenientAccents } = useSettings()
  const [restored] = useState(() => loadRun(persistKey, exercises.map((e) => e.id)))
  const [index, setIndex] = useState(restored?.index ?? 0)
  const [answers, setAnswers] = useState<AnswerRecord[]>(restored?.answers ?? [])
  const [current, setCurrent] = useState<AnswerRecord | null>(restored?.current ?? null)
  const [resumeNote, setResumeNote] = useState(!!restored)
  const [live, setLive] = useState('')
  const nextRef = useRef<HTMLButtonElement>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const moved = useRef(false)
  const answeredAt = useRef(0)
  const advancedAt = useRef(0)
  const pointerType = useRef('')

  const ex = exercises[index]
  const total = exercises.length
  const isLast = index === total - 1

  // Keep the snapshot in sync (cheap: a few KB in sessionStorage).
  useEffect(() => {
    if (index === 0 && !current && !answers.length) return
    saveRunSnapshot(persistKey, { ids: exercises.map((e) => e.id), index, answers, current })
  }, [persistKey, exercises, index, answers, current])

  function submit(s: Submission) {
    if (current || !ex) return
    const ok = s.verdict === 'correct' || (s.verdict === 'accents' && lenientAccents)
    const rec: AnswerRecord = {
      exerciseId: ex.id,
      topicId: ex.topicId,
      given: s.given,
      expected: s.expected ?? exerciseExpected(ex)[0],
      verdict: s.verdict,
      ok,
      ...(s.skipped ? { skipped: true } : {}),
    }
    answeredAt.current = Date.now()
    setCurrent(rec)
    setResumeNote(false)
    setLive(feedbackSummary(ex, rec, lenientAccents))
    if (!s.skipped) haptic(ok ? 10 : [12, 40, 12])
  }

  function next() {
    if (!current) return
    const all = [...answers, current]
    if (isLast) {
      clearRun(persistKey)
      onFinish({ correct: all.filter((a) => a.ok).length, total: all.length, answers: all })
      return
    }
    setAnswers(all)
    setCurrent(null)
    setLive('')
    setIndex((i) => i + 1)
    moved.current = true
    advancedAt.current = Date.now()
    // Keep the exercise in view on mobile after a long feedback block.
    const top = topRef.current
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start', behavior: scrollBehavior() })
  }

  /** Primary control of the task (text field, options…), or the heading when the kind has none. */
  function focusTask(control: boolean) {
    if (control && focusPrimary(sectionRef.current)) return
    headingRef.current?.focus({ preventScroll: true })
  }

  function restart() {
    clearRun(persistKey)
    setIndex(0)
    setAnswers([])
    setCurrent(null)
    setLive('')
    setResumeNote(false)
  }

  // Started by a button that unmounts: focus the task. Typing kinds get the field only with a fine pointer —
  // on a phone the first task shouldn't pop the keyboard up by itself. Plain page loads never take focus.
  const focusOnStart = useEffectEvent(() => {
    const a = document.activeElement
    if (focusOnMount && (!a || a === document.body)) focusTask(hasFinePointer())
  })
  useEffect(() => focusOnStart(), [])

  // New task after «Дальше» (which unmounts): straight to its primary control, so the next answer can be typed /
  // picked at once. On touch this opens the keyboard for typing kinds — wanted, the learner just asked for the next task.
  const focusNewTask = useEffectEvent(() => focusTask(true))
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    focusNewTask()
  }, [index])

  // Nothing focused yet (plain page load — the runner doesn't take focus then): the first key aimed at the task
  // brings focus to it. A typed letter lands in the text field; Enter just focuses the primary control.
  // (Arrows / Space are left alone: they scroll the page.)
  useEffect(() => {
    if (current) return
    const onKey = (e: KeyboardEvent) => {
      if (isLookupOpen()) return // keys belong to the word card while it is open
      const a = document.activeElement
      if (a && a !== document.body && a !== headingRef.current) return
      if (!noMods(e) || e.isComposing || isInHiddenPanel(topRef.current)) return
      const typing = e.key.length === 1 && e.key !== ' '
      if (!typing && e.key !== 'Enter') return
      const field = sectionRef.current?.querySelector('input[data-exercise-focus], textarea[data-exercise-focus]')
      // Letters only matter for text fields (digits pick choice options on their own).
      if (typing && !field) return
      if (!focusPrimary(sectionRef.current)) return
      if (!typing) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, index])

  // After answering: focus «Дальше» and let Enter (anywhere but buttons/links) advance.
  // The listener is attached on the next tick so the Enter that submitted the answer doesn't also advance.
  const advance = useEffectEvent(() => next())
  useEffect(() => {
    if (!current) return
    nextRef.current?.focus({ preventScroll: true })
    // Bring the verdict into view, with room under it for «Дальше» (pinned above the tab bar on phones, so scrolling
    // to the button alone left the verdict under it).
    // Two frames later: the answered field has just blurred, and the phone tab bar (hidden while typing) is back,
    // so the scroll margin accounts for it.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => (feedbackRef.current ?? nextRef.current)?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() }))
    })
    const onKey = (e: KeyboardEvent) => {
      if (isLookupOpen()) return // Enter belongs to the word card while it is open
      if (e.key !== 'Enter' || e.repeat || e.isComposing || !noMods(e)) return
      if (isInHiddenPanel(topRef.current)) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'A')) return
      e.preventDefault()
      advance()
    }
    const timer = setTimeout(() => window.addEventListener('keydown', onKey), 0)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [current])

  if (!ex) return <p className="text-ink-muted">Упражнений пока нет.</p>

  const done = answers.length + (current ? 1 : 0)
  const correctSoFar = answers.filter((a) => a.ok).length + (current?.ok ? 1 : 0)

  const wrongSoFar = done - correctSoFar
  const kinds = [...new Set(exercises.map((e) => e.type))].map((t) => ({ t, n: exercises.filter((e) => e.type === t).length }))

  return (
    <div ref={topRef} className={cx('scroll-mt-24', panel ? 'page-grid' : 'space-y-4')}>
      <div className="min-w-0 space-y-4">
      <div className={cx('space-y-2', panel && 'lg:hidden')}>        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 truncate font-display text-h2 leading-none text-ink">{title}</span>
          <span className="flex shrink-0 items-center gap-2 text-ink-muted tabular-nums">
            <span className="font-display text-h2 leading-none text-ink">
              <span className="sr-only">Задание </span>
              {index + 1} / {total}
            </span>
            {done > 0 && (
              <span
                key={correctSoFar}
                className="inline-flex animate-pop items-center gap-0.5 rounded-pill bg-success-soft px-2 py-0.5 text-xs font-bold text-success"
              >
                <Check aria-hidden className="size-3.5" strokeWidth={3} />
                {correctSoFar}
                <span className="sr-only"> верно</span>
              </span>
            )}
          </span>
        </div>
        <ProgressBar value={done / total} label={`Прогресс: ${done} из ${total}`} />
      </div>

      {resumeNote && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-azulejo-soft px-3 py-2 text-sm text-azulejo-ink">
          <History aria-hidden className="size-4 shrink-0" />
          <span className="flex-1">
            Продолжаем с задания {index + 1} из {total}.
          </span>
          <button type="button" className="btn-ghost btn-sm text-azulejo-ink" onClick={restart}>
            Начать заново
          </button>
        </div>
      )}

      {/* Word lookup is off until the answer is checked (no hints), then on for the prompt, answer and feedback. */}
      <section
        ref={sectionRef}
        className="card space-y-6"
        aria-labelledby={`${ex.id}-h`}
        {...lookupAttrs({ src: { kind: 'exercise', id: ex.id }, locked: !lookup || !current })}
        onPointerDownCapture={(e) => {
          pointerType.current = e.pointerType
        }}
        onClickCapture={(e) => {
          // The tail of a double activation of «Дальше» lands on the new task: swallow it (C-01).
          const since = Date.now() - advancedAt.current
          const touch = pointerType.current === 'touch' || pointerType.current === 'pen'
          // (Keyboard: a held Enter is stopped below as key repeat; a fresh Enter is deliberate.)
          const stray = (e.detail > 1 && since < DOUBLE_CLICK_GUARD_MS) || (e.detail > 0 && touch && since < TAP_GUARD_MS)
          if (!stray) return
          e.preventDefault()
          e.stopPropagation()
        }}
        onKeyDownCapture={(e) => {
          // A held Enter / Space must not keep activating buttons («Дальше», then the next task's option).
          if (!e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return
          const t = e.target as HTMLElement
          if (t.closest('input, textarea, [contenteditable="true"]')) return
          e.preventDefault()
        }}
      >
        <h3
          id={`${ex.id}-h`}
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-ink-muted outline-none"
        >
          {exerciseHeading(ex)}
        </h3>
        <ExerciseView
          key={`${ex.id}:${index}`}
          exercise={ex}
          locked={!!current}
          result={current ?? undefined}
          onSubmit={submit}
          onSkip={() => submit({ given: '', verdict: 'wrong', skipped: true })}
        />
        {current && (
          <>
            <div ref={feedbackRef} className="scroll-mt-4 scroll-mb-[calc(var(--bottom-chrome)+5.5rem)]">
              <ExerciseFeedback ex={ex} rec={current} lenient={lenientAccents} />
            </div>
            <div className="sticky-actions -mx-2 rounded-pill bg-surface p-2 sm:static sm:mx-0 sm:bg-transparent sm:p-0">
              <button
                ref={nextRef}
                type="button"
                className={cx('btn-primary w-full sm:w-auto sm:min-w-40')}
                onClick={(e) => {
                  // detail 0 = keyboard activation: ignore an Enter bounce right after the one that answered;
                  // detail > 1 = the rest of a double click on «Проверить» / an option that answered.
                  const since = Date.now() - answeredAt.current
                  if ((e.detail === 0 && since < NEXT_GUARD_MS) || (e.detail > 1 && since < DOUBLE_CLICK_GUARD_MS)) return
                  next()
                }}
              >
                {isLast ? 'Завершить' : 'Дальше'}
                <ArrowRight aria-hidden />
              </button>
            </div>
          </>
        )}
      </section>
      </div>

      {panel && (
        <aside aria-label="Ход упражнений" className="card sticky top-[calc(var(--sticky-top)+1rem)] hidden space-y-6 lg:block">
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="min-w-0 truncate">{title ?? 'Упражнения'}</h2>
              <span className="shrink-0 font-display text-h2 leading-none tabular-nums">
                <span className="sr-only">Задание </span>
                {index + 1} / {total}
              </span>
            </div>
            <ol aria-label={`Пройдено ${done} из ${total}`} className="grid grid-cols-7 gap-1.5">
              {exercises.map((e, i) => {
                const rec = i < answers.length ? answers[i] : i === index ? current : null
                const state = rec ? (rec.ok ? 'ok' : 'miss') : i === index ? 'now' : 'next'
                return (
                  <li
                    key={`${e.id}:${i}`}
                    title={`${i + 1}. ${KIND_LABEL[e.type]}`}
                    aria-current={i === index ? 'step' : undefined}
                    className={cx(
                      'h-5 rounded-pill transition-colors duration-200',
                      state === 'ok' && 'bg-brand',
                      state === 'miss' && 'bg-terracotta-fill',
                      state === 'now' && 'bg-surface ring-2 ring-inset ring-ink',
                      state === 'next' && 'bg-surface-2',
                    )}
                  >
                    <span className="sr-only">
                      {i + 1}: {state === 'ok' ? 'верно' : state === 'miss' ? 'ошибка' : state === 'now' ? 'сейчас' : 'впереди'}
                    </span>
                  </li>
                )
              })}
            </ol>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              {[
                ['Верно', correctSoFar, 'bg-brand'],
                ['Ошибок', wrongSoFar, 'bg-terracotta-fill'],
                ['Осталось', total - done, 'bg-surface'],
              ].map(([label, n, dot]) => (
                <div key={label as string} className="rounded-control bg-surface-2 px-3 py-2">
                  <dt className="flex items-center gap-1.5 text-ink-muted">
                    <i aria-hidden className={cx('inline-block size-2.5 rounded-full', dot as string, dot === 'bg-surface' && 'ring-[1.5px] ring-inset ring-line-strong')} />
                    {label}
                  </dt>
                  <dd className="font-display text-h2 leading-tight tabular-nums">{n}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-ink-muted">Что тренируем</h3>
            <ul className="space-y-1">
              {kinds.map(({ t, n }) => (
                <li key={t} className={cx('flex items-baseline justify-between gap-3 text-sm', t === ex.type ? 'font-semibold text-ink' : 'text-ink-muted')}>
                  <span>{KIND_LABEL[t]}</span>
                  <span className="tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-ink-muted">Клавиши</h3>
            <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 text-sm text-ink-muted">
              {[...KIND_KEYS[ex.type], ['Enter', 'после ответа — дальше'] as [string, string]].map(([k, what]) => (
                <div key={k + what} className="contents">
                  <dt>
                    <kbd className={kbd}>{k}</kbd>
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      )}
      {/* Always mounted, so screen readers announce each verdict. */}
      <div aria-live="polite" className="sr-only">
        {live}
      </div>
    </div>
  )
}
