import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { VocabWord } from '@/content'
import { Check, RotateCcw, X } from 'lucide-react'
import { ProgressBar } from '@/components/ProgressBar'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SpeakButton } from '@/components/SpeakButton'
import { isLookupOpen } from '@/features/words/capture/store'
import { Pt } from '@/features/words/Pt'
import { lookupAttrs, type PtSource } from '@/features/words/source'
import { GenderBadge } from './ui'

type Direction = 'pt-ru' | 'ru-pt'

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface Round {
  order: number[]
  pos: number
  flipped: boolean
  known: number[]
  unknown: number[]
}

const newRound = (indices: number[]): Round => ({
  order: shuffled(indices.length).map((k) => indices[k]),
  pos: 0,
  flipped: false,
  known: [],
  unknown: [],
})

/** One word of a self-test (a theme word, or a «Мой словарь» entry). */
export interface QuizItem {
  key: string
  pt: string
  ru: string
  gender?: VocabWord['gender']
  example?: string
}

/**
 * Flash-card self-test over a list of words (a vocab theme or the personal dictionary). Not graded into progress
 * unless the page does it in `onUnknown(index)` (themes: add to the dictionary; dictionary: «Снова» for PT → RU).
 * `source` is the lookup source (for words saved from the card); `unknownNote` / `footnote` describe what «Не знаю» does.
 * Keys: Space/Enter — flip, 1 — не знаю, 2 — знаю.
 */
export function VocabQuiz({
  items,
  source,
  onUnknown,
  onClose,
  footnote = 'Самопроверка не влияет на прогресс. «Не знаю» добавляет слово в повторение.',
  unknownNote = 'они добавлены в повторение.',
}: {
  items: readonly QuizItem[]
  source?: PtSource
  onUnknown(index: number): void
  onClose(): void
  footnote?: string
  unknownNote?: string
}) {
  const all = items.map((_, i) => i)
  const [dir, setDir] = useState<Direction>('pt-ru')
  const [round, setRound] = useState<Round>(() => newRound(all))
  const cardRef = useRef<HTMLButtonElement>(null)
  const summaryRef = useRef<HTMLButtonElement>(null)

  // Focus the flash card on open and after each answer so Space/Enter flip it natively; after the last answer
  // (the answer buttons are gone) — the summary's first action.
  useEffect(() => {
    ;(cardRef.current ?? summaryRef.current)?.focus({ preventScroll: true })
  }, [round.order, round.pos])

  const total = round.order.length
  const done = round.pos >= total
  const idx = round.order[round.pos]
  const word = done ? undefined : items[idx]

  function answer(knows: boolean) {
    if (done || !round.flipped) return
    if (!knows) onUnknown(idx)
    setRound((r) => ({
      ...r,
      pos: r.pos + 1,
      flipped: false,
      known: knows ? [...r.known, idx] : r.known,
      unknown: knows ? r.unknown : [...r.unknown, idx],
    }))
  }

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (isLookupOpen()) return // 1 / 2 / Space belong to the word card while it is open
    const t = e.target as HTMLElement | null
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
    if (done) return
    if (!round.flipped && (e.key === ' ' || e.key === 'Enter')) {
      if (t?.tagName === 'BUTTON' || t?.tagName === 'A') return
      e.preventDefault()
      setRound((r) => ({ ...r, flipped: true }))
    } else if (round.flipped && e.key === '1') answer(false)
    else if (round.flipped && e.key === '2') answer(true)
  })
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const front = word && (dir === 'pt-ru' ? word.pt : word.ru)
  const back = word && (dir === 'pt-ru' ? word.ru : word.pt)
  const ptVisible = dir === 'pt-ru' || round.flipped

  const flip = () => setRound((r) => ({ ...r, flipped: !r.flipped }))

  return (
    // Word lookup stays off until the card is flipped (the front must not give the translation away).
    <section
      className="card-raised space-y-4 p-4"
      aria-label="Самопроверка"
      {...lookupAttrs({ src: source, locked: !!word && !round.flipped })}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<Direction>
          label="Направление"
          value={dir}
          onChange={(d) => {
            setDir(d)
            setRound(newRound(all))
          }}
          options={[
            { value: 'pt-ru', label: 'PT → RU' },
            { value: 'ru-pt', label: 'RU → PT' },
          ]}
        />
        <span className="flex items-center gap-2 text-sm text-ink-muted tabular-nums">
          {Math.min(round.pos + 1, total)} / {total}
          {round.known.length + round.unknown.length > 0 && (
            <>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand-ink">
                <Check aria-hidden className="size-3.5" strokeWidth={3} />
                {round.known.length}
                <span className="sr-only"> знаю</span>
              </span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-terracotta-soft px-2 py-0.5 text-xs font-bold text-terracotta">
                <X aria-hidden className="size-3.5" strokeWidth={3} />
                {round.unknown.length}
                <span className="sr-only"> не знаю</span>
              </span>
            </>
          )}
        </span>
      </div>
      <ProgressBar value={round.pos / total} label={`Пройдено ${round.pos} из ${total}`} />

      {word ? (
        <>
          {/* The card's accessible name is its content (the word) — no overriding aria-label. */}
          <button
            ref={cardRef}
            type="button"
            onClick={flip}
            aria-expanded={round.flipped}
            aria-describedby="vq-hint"
            className="flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-card border border-line bg-sunken text-center transition-[border-color,box-shadow] hover:border-azulejo/40"
          >
            <span key={`${idx}:${dir}`} className="animate-enter font-display text-h2 leading-tight" lang={dir === 'pt-ru' ? 'pt-PT' : 'ru'}>
              {front}
            </span>
            {dir === 'pt-ru' && <GenderBadge gender={word.gender} />}
            {round.flipped && (
              <span className="flex animate-enter flex-col items-center gap-2">
                <span className="h-px w-16 bg-line-strong" aria-hidden />
                <span className="font-display text-h2 text-brand-ink" lang={dir === 'pt-ru' ? 'ru' : 'pt-PT'}>
                  {back}
                </span>
                {dir === 'ru-pt' && <GenderBadge gender={word.gender} />}
              </span>
            )}
          </button>
          {/* Outside the card button, so a word of the example can be looked up after the flip. */}
          {round.flipped && word.example && (
            <Pt
              as="p"
              src={source && source.kind === 'vocab' ? { ...source, part: 'examples', index: idx } : source}
              className="-mt-1 animate-enter text-center font-pt text-sm text-ink-muted"
            >
              {word.example}
            </Pt>
          )}
          <p id="vq-hint" className={round.flipped ? 'sr-only' : 'text-center text-sm text-ink-muted'}>
            {round.flipped ? 'Нажмите, чтобы скрыть перевод' : 'Нажмите на карточку, чтобы увидеть перевод (пробел)'}
          </p>
          {ptVisible && (
            <div className="flex justify-center">
              <SpeakButton key={word.pt} text={word.pt} label="Произношение" />
            </div>
          )}
          <div className="sticky-actions">
            {round.flipped ? (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-secondary" onClick={() => answer(false)}>
                  Не знаю <kbd className="hidden font-sans text-xs opacity-70 sm:inline">1</kbd>
                </button>
                <button type="button" className="btn-primary" onClick={() => answer(true)}>
                  Знаю <kbd className="hidden font-sans text-xs opacity-70 sm:inline">2</kbd>
                </button>
              </div>
            ) : (
              <button type="button" className="btn-primary w-full" onClick={() => setRound((r) => ({ ...r, flipped: true }))}>
                Показать ответ
              </button>
            )}
          </div>
          <p className="text-center text-sm text-ink-muted">
            {footnote}
          </p>
        </>
      ) : (
        <div className="animate-enter space-y-4 text-center">
          <p className="font-display text-h2 text-brand-ink tabular-nums">
            {round.known.length} / {total}
          </p>
          <p className="text-ink-muted">
            {round.unknown.length === 0
              ? 'Все слова знакомы!'
              : `Незнакомых слов: ${round.unknown.length} — ${unknownNote}`}
          </p>
          {round.unknown.length > 0 && (
            <ul className="card-sunken mx-auto max-w-md divide-y divide-line p-0 text-left">
              {round.unknown.map((i) => (
                <li key={i} className="flex justify-between gap-3 px-3 py-2">
                  <Pt as="b" src={source && source.kind === 'vocab' ? { ...source, part: 'examples', index: i } : source} ru={items[i].ru}>
                    {items[i].pt}
                  </Pt>
                  <span className="text-ink-muted">{items[i].ru}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            {round.unknown.length > 0 && (
              <button ref={summaryRef} type="button" className="btn-primary" onClick={() => setRound(newRound(round.unknown))}>
                <RotateCcw aria-hidden className="size-5" /> Повторить незнакомые ({round.unknown.length})
              </button>
            )}
            <button
              ref={round.unknown.length > 0 ? undefined : summaryRef}
              type="button"
              className="btn-secondary"
              onClick={() => setRound(newRound(all))}
            >
              Пройти заново
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Закрыть
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
