import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { VocabTheme } from '@/content'
import { ProgressBar } from '@/components/ProgressBar'
import { SpeakButton } from '@/features/exercises'
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

/**
 * Flash-card self-test over a vocab theme. Not graded into progress;
 * «Не знаю» calls `onUnknown(wordIndex)` (the page adds the word to SRS).
 * Keys: Space/Enter — flip, 1 — не знаю, 2 — знаю.
 */
export function VocabQuiz({
  theme,
  onUnknown,
  onClose,
}: {
  theme: VocabTheme
  onUnknown(index: number): void
  onClose(): void
}) {
  const all = theme.words.map((_, i) => i)
  const [dir, setDir] = useState<Direction>('pt-ru')
  const [round, setRound] = useState<Round>(() => newRound(all))
  const cardRef = useRef<HTMLButtonElement>(null)

  // Focus the flash card on open and after each answer so Space/Enter flip it natively.
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true })
  }, [round.order, round.pos])

  const total = round.order.length
  const done = round.pos >= total
  const idx = round.order[round.pos]
  const word = done ? undefined : theme.words[idx]

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

  return (
    <section className="card space-y-4 sm:p-6" aria-label="Самопроверка">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-800" role="group" aria-label="Направление">
          {(['pt-ru', 'ru-pt'] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={dir === d}
              onClick={() => {
                setDir(d)
                setRound(newRound(all))
              }}
              className={`rounded-lg px-3 py-1 text-sm font-medium transition ${
                dir === d ? 'bg-white shadow-sm dark:bg-stone-900' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              {d === 'pt-ru' ? 'PT → RU' : 'RU → PT'}
            </button>
          ))}
        </div>
        <span className="text-sm text-stone-500 tabular-nums">
          {Math.min(round.pos + 1, total)} / {total}
          {round.known.length + round.unknown.length > 0 && (
            <>
              {' · '}
              <span className="text-brand-700 dark:text-brand-500">✓ {round.known.length}</span>{' '}
              <span className="text-red-600">✗ {round.unknown.length}</span>
            </>
          )}
        </span>
      </div>
      <ProgressBar value={round.pos / total} label={`Пройдено ${round.pos} из ${total}`} />

      {word ? (
        <>
          <button
            ref={cardRef}
            type="button"
            onClick={() => setRound((r) => ({ ...r, flipped: !r.flipped }))}
            className="flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-5 text-center transition hover:border-brand-500/40 dark:border-stone-700 dark:bg-stone-950/40"
            aria-label={round.flipped ? 'Скрыть ответ' : 'Показать ответ'}
          >
            <span className="text-2xl font-semibold" lang={dir === 'pt-ru' ? 'pt-PT' : 'ru'}>
              {front}
            </span>
            {dir === 'pt-ru' && <GenderBadge gender={word.gender} />}
            {round.flipped ? (
              <>
                <span className="h-px w-16 bg-stone-300 dark:bg-stone-700" aria-hidden />
                <span className="text-xl text-brand-800 dark:text-brand-100" lang={dir === 'pt-ru' ? 'ru' : 'pt-PT'}>
                  {back}
                </span>
                {dir === 'ru-pt' && <GenderBadge gender={word.gender} />}
                {word.example && (
                  <span className="text-sm text-stone-500 italic" lang="pt-PT">
                    {word.example}
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-stone-400">нажмите, чтобы увидеть ответ (пробел)</span>
            )}
          </button>
          {ptVisible && (
            <div className="flex justify-center">
              <SpeakButton key={word.pt} text={word.pt} label="Произношение" />
            </div>
          )}
          {round.flipped ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-secondary border-red-300 text-red-700 dark:border-red-800 dark:text-red-300" onClick={() => answer(false)}>
                Не знаю <kbd className="hidden text-xs opacity-60 sm:inline">1</kbd>
              </button>
              <button type="button" className="btn-primary" onClick={() => answer(true)}>
                Знаю <kbd className="hidden text-xs opacity-60 sm:inline">2</kbd>
              </button>
            </div>
          ) : (
            <button type="button" className="btn-primary w-full" onClick={() => setRound((r) => ({ ...r, flipped: true }))}>
              Показать ответ
            </button>
          )}
          <p className="text-center text-xs text-stone-500">
            Самопроверка не влияет на прогресс. «Не знаю» добавляет слово в повторение.
          </p>
        </>
      ) : (
        <div className="space-y-4 text-center">
          <p className="text-4xl font-bold text-brand-700 tabular-nums dark:text-brand-500">
            {round.known.length} / {total}
          </p>
          <p className="text-stone-600 dark:text-stone-400">
            {round.unknown.length === 0
              ? 'Все слова знакомы!'
              : `Незнакомых слов: ${round.unknown.length} — они добавлены в повторение.`}
          </p>
          {round.unknown.length > 0 && (
            <ul className="mx-auto max-w-md divide-y divide-stone-200 text-left dark:divide-stone-800">
              {round.unknown.map((i) => (
                <li key={i} className="flex justify-between gap-3 py-1.5">
                  <b lang="pt-PT">{theme.words[i].pt}</b>
                  <span className="text-stone-600 dark:text-stone-400">{theme.words[i].ru}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            {round.unknown.length > 0 && (
              <button type="button" className="btn-primary" onClick={() => setRound(newRound(round.unknown))}>
                Повторить незнакомые ({round.unknown.length})
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={() => setRound(newRound(all))}>
              Пройти заново
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Закрыть
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
