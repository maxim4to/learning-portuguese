import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepository } from '@/data'
import type { Settings, SrsCard } from '@/data/types.ts'
import { formatInterval, isNewCard, previewIntervals, schedule, type ReviewRating } from '@/engine/fsrs'
import { stopSpeaking } from '@/engine/audio'
import { CardFace } from './CardFace'
import { bumpNewSeenToday } from './newCardCounter'

/** Cards due again within this window are re-shown in the same session (learning steps). */
const REQUEUE_MS = 20 * 60_000

const RATING_UI: { rating: ReviewRating; label: string; key: string; cls: string }[] = [
  { rating: 'again', label: 'Снова', key: '1', cls: 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200' },
  { rating: 'hard', label: 'Трудно', key: '2', cls: 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200' },
  { rating: 'good', label: 'Хорошо', key: '3', cls: 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' },
  { rating: 'easy', label: 'Легко', key: '4', cls: 'border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200' },
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

  const total = counts.again + counts.hard + counts.good + counts.easy

  if (!card) {
    const minutes = Math.max(1, Math.round(((finishedAt ?? startedAt) - startedAt) / 60_000))
    const recalled = total ? (total - counts.again) / total : 0
    return (
      <section className="card space-y-4 text-center">
        <p className="text-4xl" aria-hidden>
          🎉
        </p>
        <h2>Сессия завершена</h2>
        <p className="text-stone-600 dark:text-stone-400">
          Карточек: {reviewedIds.size} · ответов: {total} · вспомнили {Math.round(recalled * 100)}% · ~{minutes} мин
        </p>
        <div className="mx-auto grid max-w-md grid-cols-4 gap-2 text-sm">
          {RATING_UI.map((r) => (
            <div key={r.rating} className={`rounded-xl border p-2 ${r.cls}`}>
              <div className="text-lg font-semibold tabular-nums">{counts[r.rating]}</div>
              {r.label}
            </div>
          ))}
        </div>
        {saveError && <p className="text-sm text-red-600">Не всё сохранилось: {saveError}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          <Link to="/" className="btn-primary no-underline">
            На главную
          </Link>
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
      <div className="flex items-center gap-3 text-sm text-stone-500">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
          <div className="h-full bg-brand-600 transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="tabular-nums">осталось {remaining}</span>
        <button
          className="text-stone-500 underline-offset-2 hover:underline"
          onClick={() => {
            setFinishedAt(Date.now())
            setQueue([])
          }}
        >
          завершить
        </button>
      </div>

      <div
        className="card cursor-default select-text"
        onClick={() => !revealed && setRevealed(true)}
        role={revealed ? undefined : 'button'}
        aria-label={revealed ? undefined : 'Показать ответ'}
      >
        <CardFace key={card.id + card.fsrs.reps} card={card} revealed={revealed} settings={settings} />
      </div>

      {saveError && <p className="text-sm text-red-600">Ошибка сохранения: {saveError}</p>}

      {!revealed ? (
        <button className="btn-primary w-full py-3.5" onClick={() => setRevealed(true)}>
          Показать ответ <kbd className="hidden rounded bg-white/20 px-1.5 text-xs md:inline">пробел</kbd>
        </button>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {RATING_UI.map((r) => (
            <button
              key={r.rating}
              onClick={() => rate(r.rating)}
              className={`flex flex-col items-center rounded-xl border px-1 py-2.5 transition ${r.cls}`}
            >
              <span className="text-sm font-semibold md:text-base">{r.label}</span>
              <span className="text-xs tabular-nums opacity-80">{intervals?.[r.rating] ?? formatInterval(0)}</span>
              <kbd className="mt-0.5 hidden text-[10px] opacity-60 md:block">{r.key}</kbd>
            </button>
          ))}
        </div>
      )}
      <p className="hidden text-center text-xs text-stone-500 md:block">
        Клавиши: пробел — показать ответ, 1–4 — оценка (пробел после ответа = «Хорошо»)
      </p>
    </section>
  )
}
