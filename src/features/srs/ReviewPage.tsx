import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useRepository } from '@/data'
import type { SrsCard } from '@/data/types.ts'
import { dueCards, formatInterval, isNewCard } from '@/engine/fsrs'
import { useProgressData } from '@/features/dashboard/useProgressData'
import { CardList } from './CardList'
import { cardsFromErrors, isDeleted } from './cardOps'
import { newSeenToday } from './newCardCounter'
import { ReviewSession } from './ReviewSession'

export function ReviewPage() {
  const repo = useRepository()
  const data = useProgressData()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'all' ? 'all' : 'session'
  const [session, setSession] = useState<SrsCard[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const cards = useMemo(() => data.cards.filter((c) => !isDeleted(c)), [data.cards])
  const [now, setNow] = useState(() => Date.now())
  const due = useMemo(
    () => dueCards(cards, now, { newPerDay: data.settings?.newCardsPerDay, newSeenToday: newSeenToday(now) }),
    [cards, data.settings, now],
  )
  const pendingErrorCards = useMemo(() => cardsFromErrors(data.errors, data.cards), [data.errors, data.cards])

  const { reload } = data
  // "К карточкам" at the end of a session leads to the full card list, not back to the session start screen.
  const finish = useCallback(() => {
    setSession(null)
    setNow(Date.now())
    setParams({ tab: 'all' }, { replace: true })
    void reload()
  }, [reload, setParams])

  async function addErrorCards() {
    await repo.upsertCards(pendingErrorCards)
    setMsg(`Добавлено карточек из журнала ошибок: ${pendingErrorCards.length}`)
    await data.reload()
    setNow(Date.now())
  }

  if (data.loading) return <p className="text-stone-500">Загрузка…</p>
  if (data.error) return <p className="text-red-600">Ошибка загрузки: {data.error}</p>

  if (session) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1>Повторение</h1>
        <ReviewSession initial={session} settings={data.settings} onCardUpdated={noop} onFinish={finish} />
      </div>
    )
  }

  const nextDue = cards
    .filter((c) => !c.suspended && !isNewCard(c) && c.fsrs.due > now)
    .reduce<number | null>((m, c) => (m === null || c.fsrs.due < m ? c.fsrs.due : m), null)
  const newCount = due.filter(isNewCard).length

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Повторение</h1>
        <div className="flex rounded-xl border border-stone-300 p-0.5 text-sm dark:border-stone-700" role="tablist">
          {(['session', 'all'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setParams(t === 'all' ? { tab: 'all' } : {}, { replace: true })}
              className={`rounded-lg px-3 py-1 ${tab === t ? 'bg-brand-700 text-white' : 'text-stone-600 dark:text-stone-300'}`}
            >
              {t === 'session' ? 'Сессия' : `Все карточки (${cards.length})`}
            </button>
          ))}
        </div>
      </div>

      {msg && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-800/30 dark:text-brand-100">{msg}</p>}

      {tab === 'all' ? (
        <CardList cards={cards} onChanged={() => void reload()} />
      ) : cards.length === 0 ? (
        <section className="card space-y-3 text-center">
          <p className="text-4xl" aria-hidden>
            🗂️
          </p>
          <h2>Добавить карточки</h2>
          <p className="text-stone-600 dark:text-stone-400">
            Карточек пока нет. Они появляются, когда вы нажимаете «Добавить в повторение» в уроке или ситуации, а ошибки
            из упражнений попадают в журнал ошибок.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {pendingErrorCards.length > 0 && (
              <button className="btn-primary" onClick={() => void addErrorCards()}>
                Создать из журнала ошибок ({pendingErrorCards.length})
              </button>
            )}
            <Link to="/syllabus" className="btn-secondary no-underline">
              Открыть курс
            </Link>
          </div>
        </section>
      ) : (
        <section className="card space-y-4 text-center">
          {due.length > 0 ? (
            <>
              <p className="text-5xl font-semibold tabular-nums">{due.length}</p>
              <p className="text-stone-600 dark:text-stone-400">
                карточек к повторению{newCount ? ` (новых: ${newCount})` : ''}
              </p>
              <button className="btn-primary w-full py-3.5 sm:w-auto sm:px-10" onClick={() => setSession(dueCards(cards, Date.now(), { newPerDay: data.settings?.newCardsPerDay, newSeenToday: newSeenToday() }))}>
                Начать
              </button>
            </>
          ) : (
            <>
              <p className="text-4xl" aria-hidden>
                ✅
              </p>
              <h2>На сегодня всё</h2>
              <p className="text-stone-600 dark:text-stone-400">
                {nextDue ? `Следующая карточка через ${formatInterval(nextDue - now)}.` : 'Нет запланированных карточек.'}
                {newSeenToday(now) >= (data.settings?.newCardsPerDay ?? 15) && ' Лимит новых карточек на сегодня исчерпан.'}
              </p>
            </>
          )}
          {pendingErrorCards.length > 0 && (
            <p className="text-sm">
              Ошибок из журнала без карточек: {pendingErrorCards.length}.{' '}
              <button className="text-brand-700 underline dark:text-brand-500" onClick={() => void addErrorCards()}>
                Добавить в повторение
              </button>
            </p>
          )}
        </section>
      )}
    </div>
  )
}

const noop = () => {}
