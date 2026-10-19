import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PartyPopper, X } from 'lucide-react'
import { ButtonLink } from '@/components/Button'
import { ProgressBar } from '@/components/ProgressBar'
import { useRepository } from '@/data'
import type { Settings, SrsCard } from '@/data/types.ts'
import { formatInterval, isNewCard, previewIntervals, schedule, type ReviewRating } from '@/engine/fsrs'
import { stopSpeaking } from '@/engine/audio'
import { CardFace } from './CardFace'
import { bumpNewSeenToday } from './newCardCounter'

/** Cards due again within this window are re-shown in the same session (learning steps). */
const REQUEUE_MS = 20 * 60_000

const RATING_UI: { rating: ReviewRating; label: string; key: string; cls: string }[] = [
  { rating: 'again', label: 'Снова', key: '1', cls: 'border-danger-line bg-danger-soft text-danger hover:border-danger' },
  { rating: 'hard', label: 'Трудно', key: '2', cls: 'border-warning-line bg-sun-soft text-sun hover:border-sun' },
  { rating: 'good', label: 'Хорошо', key: '3', cls: 'border-brand/35 bg-brand-soft text-brand-ink hover:border-brand' },
  { rating: 'easy', label: 'Легко', key: '4', cls: 'border-azulejo/30 bg-azulejo-soft text-azulejo-ink hover:border-azulejo' },
]

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
  const ratingsRef = useRef<HTMLDivElement>(null)
  const revealRef = useRef<HTMLButtonElement>(null)
  const endRef = useRef<HTMLButtonElement>(null)
  const summaryRef = useRef<HTMLHeadingElement>(null)
  const askedEnd = useRef(false)

  const card = queue[0]
  const intervals = useMemo(() => (card && revealed ? previewIntervals(card) : null), [card, revealed])

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
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setRevealed(true)
        return
      }
      if (revealed) {
        const r = RATING_UI.find((x) => x.key === e.key)
        if (r) {
          e.preventDefault()
          rate(r.rating)
        } else if (e.key === ' ') {
          e.preventDefault()
          rate('good')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, rate])

  useEffect(() => () => stopSpeaking(), [])

  // Focus management: after «Показать ответ» the button unmounts — move focus to the rating group;
  // after a rating — back to «Показать ответ» for the next card; on start too («Начать» unmounts).
  useEffect(() => {
    if (revealed) ratingsRef.current?.focus({ preventScroll: true })
    else if (card) revealRef.current?.focus({ preventScroll: true })
    else summaryRef.current?.focus({ preventScroll: true })
  }, [revealed, card])

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
      <section className="card-raised animate-enter space-y-5 rounded-hero p-6 text-center sm:p-8">
        <span aria-hidden className="mx-auto grid size-16 place-items-center rounded-2xl bg-sun-soft text-sun">
          <PartyPopper className="size-8" />
        </span>
        <h2 ref={summaryRef} tabIndex={-1} className="font-serif text-2xl font-semibold outline-none">
          Сессия завершена
        </h2>
        <p className="text-ink-muted">
          Карточек: {reviewedIds.size} · ответов: {total} · вспомнили {Math.round(recalled * 100)}% · ~{minutes} мин
        </p>
        <div className="mx-auto grid max-w-md grid-cols-4 gap-2 text-sm">
          {RATING_UI.map((r) => (
            <div key={r.rating} className={`rounded-control border p-2 font-semibold ${r.cls}`}>
              <div className="text-xl font-bold tabular-nums">{counts[r.rating]}</div>
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
            className="hit -mr-2 inline-flex min-h-9 items-center gap-1 rounded-lg px-2 font-semibold hover:bg-surface-2 hover:text-ink"
            onClick={() => setConfirmEnd(true)}
          >
            <X aria-hidden className="size-4" /> Завершить
          </button>
        )}
      </div>

      <div className="card-raised select-text sm:p-6">
        <CardFace key={card.id + card.fsrs.reps} card={card} revealed={revealed} settings={settings} />
      </div>

      {saveError && <p className="text-sm text-danger">Ошибка сохранения: {saveError}</p>}

      <div className="sticky-actions">
        {!revealed ? (
          <button ref={revealRef} className="btn-primary min-h-14 w-full text-lg shadow-raised" onClick={() => setRevealed(true)}>
            Показать ответ
            <kbd className="hidden rounded-md bg-on-brand/20 px-1.5 py-0.5 font-sans text-xs md:inline">пробел</kbd>
          </button>
        ) : (
          <div
            ref={ratingsRef}
            tabIndex={-1}
            role="group"
            aria-label="Насколько легко вы вспомнили?"
            className="grid grid-cols-4 gap-2 rounded-control outline-none"
          >
            {RATING_UI.map((r) => (
              <button
                key={r.rating}
                onClick={() => rate(r.rating)}
                className={`flex min-h-14 animate-enter flex-col items-center justify-center rounded-control border-[1.5px] px-1 py-2 shadow-card transition-[border-color,transform] active:scale-[0.97] ${r.cls}`}
              >
                <span className="text-sm font-bold md:text-base">{r.label}</span>
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
      <p className="hidden text-center text-xs text-ink-muted md:block">
        Клавиши: пробел — показать ответ, 1–4 — оценка (пробел после ответа = «Хорошо»)
      </p>
    </section>
  )
}
