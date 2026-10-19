import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PartyPopper, X } from 'lucide-react'
import { ButtonLink } from '@/components/Button'
import { AzulejoCorner } from '@/components/Card'
import { DotGrid } from '@/components/DotGrid'
import { ProgressBar } from '@/components/ProgressBar'
import { useRepository } from '@/data'
import type { Settings, SrsCard } from '@/data/types.ts'
import { formatInterval, isNewCard, previewIntervals, schedule, type ReviewRating } from '@/engine/fsrs'
import { stopSpeaking } from '@/engine/audio'
import { findExercise } from '@/content'
import { cx, scrollBehavior } from '@/components/cx'
import { ReviewExercise, type AnswerRecord } from '@/features/exercises'
import { CardFace, CardHeader, TopicRepeatLink } from './CardFace'
import { bumpNewSeenToday } from './newCardCounter'

/** Cards due again within this window are re-shown in the same session (learning steps). */
const REQUEUE_MS = 20 * 60_000

const RATING_UI: { rating: ReviewRating; label: string; key: string; cls: string }[] = [
  { rating: 'again', label: 'Снова', key: '1', cls: 'border-danger-line bg-danger-soft text-danger hover:border-danger' },
  { rating: 'hard', label: 'Трудно', key: '2', cls: 'border-sun-soft bg-sun-soft text-sun hover:border-sun' },
  { rating: 'good', label: 'Хорошо', key: '3', cls: 'border-brand bg-brand text-on-brand hover:bg-brand-hover' },
  { rating: 'easy', label: 'Легко', key: '4', cls: 'border-ink bg-surface text-ink hover:bg-surface-2' },
]

/** Rating suggested by an answer to the original exercise of an 'error' card. */
function suggestRating(rec: AnswerRecord): ReviewRating {
  if (rec.skipped || rec.verdict === 'wrong') return 'again'
  return rec.verdict === 'accents' ? 'hard' : 'good'
}

/** Keyboard-activated clicks this soon after the rating row appears are ignored (held / repeated Enter). */
const KEY_GUARD_MS = 350

interface Props {
  initial: SrsCard[]
  settings: Settings | null
  /** Called with every updated card (after it was persisted). */
  onCardUpdated(card: SrsCard): void
  onFinish(): void
}

export function ReviewSession({ initial, settings, onCardUpdated, onFinish }: Props) {
  const repo = useRepository()
  const [queue, setQueue] = useState<SrsCard[]>(initial)
  const [revealed, setRevealed] = useState(false)
  const [counts, setCounts] = useState<Record<ReviewRating, number>>({ again: 0, hard: 0, good: 0, easy: 0 })
  const [reviewedIds] = useState(() => new Set<string>())
  const [startedAt] = useState(() => Date.now())
  const [saveError, setSaveError] = useState<string | null>(null)
  const [finishedAt, setFinishedAt] = useState<number | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [answer, setAnswer] = useState<AnswerRecord | null>(null)
  const revealedAt = useRef(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const ratingBtns = useRef<Partial<Record<ReviewRating, HTMLButtonElement | null>>>({})
  const revealRef = useRef<HTMLButtonElement>(null)
  const endRef = useRef<HTMLButtonElement>(null)
  const summaryRef = useRef<HTMLHeadingElement>(null)
  const askedEnd = useRef(false)

  const card = queue[0]
  const intervals = useMemo(() => (card && revealed ? previewIntervals(card) : null), [card, revealed])
  // 'error' cards are reviewed as their original exercise when it still exists in the content.
  const loc = card?.kind === 'error' && card.exerciseId ? findExercise(card.exerciseId) : undefined
  const exerciseMode = !!loc
  const suggested: ReviewRating = exerciseMode && answer ? suggestRating(answer) : 'good'

  const reveal = useCallback(() => {
    revealedAt.current = Date.now()
    setRevealed(true)
  }, [])
  const onAnswered = useCallback(
    (rec: AnswerRecord) => {
      setAnswer(rec)
      reveal()
    },
    [reveal],
  )

  const rate = useCallback(
    (rating: ReviewRating) => {
      if (!card || !revealed) return
      const now = Date.now()
      const updated = schedule(card, rating, now)
      if (isNewCard(card)) bumpNewSeenToday(now)
      reviewedIds.add(card.id)
      setCounts((c) => ({ ...c, [rating]: c[rating] + 1 }))
      const rest = queue.slice(1)
      const next = updated.fsrs.due - now <= REQUEUE_MS ? [...rest, updated] : rest
      setQueue(next)
      setRevealed(false)
      setAnswer(null)
      stopSpeaking()
      if (!next.length) setFinishedAt(now)
      repo
        .upsertCards([updated])
        .then(() => onCardUpdated(updated))
        .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)))
    },
    [card, revealed, queue, repo, reviewedIds, onCardUpdated],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // Space / Enter on a focused button or link («Завершить», «Отмена», audio…) activates that control.
      if ((e.key === ' ' || e.key === 'Enter') && el?.closest('button, a')) return
      // Before answering, the exercise owns the keyboard (1–9 options, Enter checks…).
      if (exerciseMode && !revealed) return
      const confirm = e.key === ' ' || e.key === 'Enter'
      if (confirm && e.repeat) return
      if (!revealed && confirm) {
        e.preventDefault()
        reveal()
        return
      }
      if (revealed) {
        const r = RATING_UI.find((x) => x.key === e.key)
        if (r) {
          e.preventDefault()
          rate(r.rating)
        } else if (confirm && Date.now() - revealedAt.current > KEY_GUARD_MS) {
          e.preventDefault()
          rate(suggested)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, rate, reveal, exerciseMode, suggested])

  useEffect(() => () => stopSpeaking(), [])

  // Focus management: after «Показать ответ» / answering the exercise — the suggested rating (Space/Enter confirms it);
  // after a rating — «Показать ответ» for the next flashcard (exercise cards focus their own field / heading on mount);
  // on start too («Начать» unmounts).
  useEffect(() => {
    if (revealed) {
      ratingBtns.current[suggested]?.focus({ preventScroll: true })
      // Phones: keep the answer / feedback visible above the sticky rating row.
      // Measured after the flashcard back's 240 ms reveal animation; exercise feedback wins over the task's top.
      const timer = setTimeout(() => {
        const cardBox = cardRef.current?.getBoundingClientRect()
        const rowBox = actionsRef.current?.getBoundingClientRect()
        if (!cardBox || !rowBox) return
        const overlap = cardBox.bottom - rowBox.top + 12
        const top = exerciseMode ? overlap : Math.min(overlap, Math.max(0, cardBox.top - 16))
        if (top > 0) window.scrollBy({ top, behavior: scrollBehavior() })
      }, exerciseMode ? 60 : 260)
      return () => clearTimeout(timer)
    }
    else if (card && !exerciseMode) revealRef.current?.focus({ preventScroll: true })
    else if (!card) summaryRef.current?.focus({ preventScroll: true })
    // `suggested` is fixed once revealed; re-running on it would only re-focus the same button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, card, exerciseMode])

  // «Завершить?» swaps the button for a confirm group: focus «Отмена» there, and return to «Завершить» on cancel.
  useEffect(() => {
    if (confirmEnd) askedEnd.current = true
    else if (askedEnd.current) {
      askedEnd.current = false
      endRef.current?.focus()
    }
  }, [confirmEnd])

  const total = counts.again + counts.hard + counts.good + counts.easy

  if (!card) {
    const minutes = Math.max(1, Math.round(((finishedAt ?? startedAt) - startedAt) / 60_000))
    const recalled = total ? (total - counts.again) / total : 0
    return (
      <section data-halftone-surface="" className="card-raised animate-enter relative isolate space-y-5 overflow-hidden rounded-hero p-6 pt-0 text-center sm:p-10 sm:pt-0">
        <div aria-hidden className="relative -mx-6 mb-2 h-36 bg-terracotta-fill sm:-mx-10 sm:h-44">
          <DotGrid mask="fade-bottom" maskStops={[0, 0.9]} dotSize={6} gap={4} rotate={18} activeColor="--sun" shockRadius={220} />
          <span className="absolute bottom-0 left-1/2 grid size-20 -translate-x-1/2 translate-y-1/3 place-items-center rounded-full bg-surface text-ink">
            <PartyPopper className="size-9" />
          </span>
        </div>
        <h2 ref={summaryRef} tabIndex={-1} className="pt-6 text-[2.75rem] leading-[0.95] outline-none sm:text-display">
          Сессия завершена
        </h2>
        <p className="text-ink-muted">
          Карточек: {reviewedIds.size} · ответов: {total} · вспомнили {Math.round(recalled * 100)}% · ~{minutes} мин
        </p>
        <div className="mx-auto grid max-w-md grid-cols-4 gap-2 text-sm">
          {RATING_UI.map((r) => (
            <div key={r.rating} className={`rounded-[1.25rem] border-[1.5px] p-2 font-semibold ${r.cls}`}>
              <div className="font-display text-3xl tabular-nums">{counts[r.rating]}</div>
              {r.label}
            </div>
          ))}
        </div>
        {saveError && <p className="text-sm text-danger">Не всё сохранилось: {saveError}</p>}
        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          <ButtonLink to="/">На главную</ButtonLink>
          <button className="btn-secondary" onClick={onFinish}>
            К карточкам
          </button>
        </div>
      </section>
    )
  }

  const remaining = queue.length
  const done = reviewedIds.size
  const progress = done / Math.max(1, done + new Set(queue.map((c) => c.id)).size)

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3 text-sm text-ink-muted">
        <ProgressBar value={progress} size="md" label={`Пройдено карточек: ${done}`} className="flex-1" />
        <span className="tabular-nums">осталось {remaining}</span>
        {confirmEnd ? (
          <span className="flex items-center gap-1" role="group" aria-label="Завершить сессию?">
            <button
              className="btn-secondary min-h-9 px-3 text-sm"
              onClick={() => {
                setFinishedAt(Date.now())
                setQueue([])
              }}
            >
              Завершить
            </button>
            <button className="btn-ghost min-h-9 px-3 text-sm" autoFocus onClick={() => setConfirmEnd(false)}>
              Отмена
            </button>
          </span>
        ) : (
          <button
            ref={endRef}
            className="hit -mr-2 inline-flex min-h-9 items-center gap-1 rounded-pill px-3 font-semibold hover:bg-surface-2 hover:text-ink"
            onClick={() => setConfirmEnd(true)}
          >
            <X aria-hidden className="size-4" /> Завершить
          </button>
        )}
      </div>

      <div
        ref={cardRef}
        data-halftone-surface=""
        className={cx(
          'card-raised relative isolate rounded-hero p-5 select-text sm:p-10',
          // overflow-clip (not hidden) keeps the exercise's own sticky «Проверить» bar working on phones.
          exerciseMode ? 'overflow-clip' : 'overflow-hidden',
        )}
      >
        <AzulejoCorner size="sm" opacity={0.5} />
        {loc ? (
          <div className="space-y-5">
            <CardHeader card={card} />
            <ReviewExercise
              key={card.id + card.fsrs.reps}
              exercise={loc.exercise}
              note="Задание, в котором была ошибка"
              onAnswered={onAnswered}
            />
            {revealed && <TopicRepeatLink topicId={card.topicId} />}
          </div>
        ) : (
          <CardFace key={card.id + card.fsrs.reps} card={card} revealed={revealed} settings={settings} />
        )}
      </div>

      {saveError && <p className="text-sm text-danger">Ошибка сохранения: {saveError}</p>}

      <div ref={actionsRef} className="sticky-actions">
        {exerciseMode && !revealed ? null : !revealed ? (
          <button ref={revealRef} className="btn-primary min-h-14 w-full text-lg" onClick={reveal}>
            Показать ответ
            <kbd className="hidden rounded-md bg-on-brand/20 px-1.5 py-0.5 font-sans text-xs md:inline">пробел</kbd>
          </button>
        ) : (
          <div
            role="group"
            aria-label={exerciseMode ? 'Оцените, как далось задание' : 'Насколько легко вы вспомнили?'}
            className="grid grid-cols-4 gap-2 rounded-control outline-none"
          >
            {RATING_UI.map((r) => (
              <button
                key={r.rating}
                ref={(el) => {
                  ratingBtns.current[r.rating] = el
                }}
                onClick={(e) => {
                  // detail 0 = keyboard activation: ignore the Enter that answered the task, if held.
                  if (e.detail === 0 && Date.now() - revealedAt.current < KEY_GUARD_MS) return
                  rate(r.rating)
                }}
                className={cx(
                  'flex min-h-16 animate-enter flex-col items-center justify-center rounded-[1.75rem] border-[1.5px] px-1 py-2 transition-[background-color,border-color,transform] active:scale-[0.97]',
                  r.cls,
                  exerciseMode && r.rating === suggested && 'ring-2 ring-ink ring-offset-2 ring-offset-bg',
                )}
              >
                <span className="text-sm font-bold md:text-base">{r.label}</span>
                {exerciseMode && r.rating === suggested && <span className="sr-only"> (предложено по ответу)</span>}
                <span className="text-xs tabular-nums">
                  <span className="sr-only">следующий показ через </span>
                  {intervals?.[r.rating] ?? formatInterval(0)}
                </span>
                <kbd className="mt-0.5 hidden font-sans text-[11px] font-semibold md:block">{r.key}</kbd>
              </button>
            ))}
          </div>
        )}
      </div>
      {exerciseMode && revealed && (
        <p className="text-center text-xs text-ink-muted">Оценка предложена по ответу — можно выбрать другую.</p>
      )}
      <p className="hidden text-center text-xs text-ink-muted md:block">
        {exerciseMode
          ? revealed
            ? 'Клавиши: 1–4 — оценка, пробел / Enter — предложенная оценка'
            : 'Клавиши: 1–9 — вариант ответа, Enter — проверить; затем 1–4 — оценка'
          : 'Клавиши: пробел — показать ответ, 1–4 — оценка (пробел / Enter после ответа = «Хорошо»)'}
      </p>
    </section>
  )
}
