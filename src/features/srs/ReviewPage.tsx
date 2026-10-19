import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layers, Plus } from 'lucide-react'
import { ButtonLink } from '@/components/Button'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { AzulejoCorner } from '@/components/Card'
import { TabPanel, Tabs } from '@/components/Tabs'
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

  if (data.loading) return <PageSkeleton cards={2} />
  if (data.error) return <ErrorState detail={data.error} onRetry={() => void reload()} />

  if (session) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="sr-only">Повторение</h1>
        <ReviewSession initial={session} settings={data.settings} onCardUpdated={noop} onFinish={finish} />
      </div>
    )
  }

  const nextDue = cards
    .filter((c) => !c.suspended && !isNewCard(c) && c.fsrs.due > now)
    .reduce<number | null>((m, c) => (m === null || c.fsrs.due < m ? c.fsrs.due : m), null)
  const newCount = due.filter(isNewCard).length
  const start = () =>
    setSession(dueCards(cards, Date.now(), { newPerDay: data.settings?.newCardsPerDay, newSeenToday: newSeenToday() }))
  const setTab = (t: 'session' | 'all') => setParams(t === 'all' ? { tab: 'all' } : {}, { replace: true })

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Повторение" subtitle="Интервальное повторение: карточки возвращаются, когда пора вспомнить." />

      <Tabs
        idBase="review"
        label="Повторение"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'session', label: 'Сессия', meta: due.length || undefined },
          { value: 'all', label: 'Все карточки', meta: cards.length },
        ]}
      />

      {msg && (
        <p role="status" className="rounded-control bg-brand-soft p-3 text-sm text-brand-ink">
          {msg}
        </p>
      )}

      <TabPanel idBase="review" value="all" active={tab === 'all'}>
        {tab === 'all' && <CardList cards={cards} onChanged={() => void reload()} />}
      </TabPanel>

      <TabPanel idBase="review" value="session" active={tab === 'session'}>
        {cards.length === 0 ? (
          <section className="card">
            <EmptyState
              icon={<Layers className="size-7" />}
              tone="azulejo"
              title="Карточек пока нет"
              text="Они появляются, когда вы нажимаете «Добавить в повторение» в уроке или ситуации. Ошибки из упражнений попадают в журнал ошибок."
              action={
                <>
                  {pendingErrorCards.length > 0 && (
                    <button className="btn-primary" onClick={() => void addErrorCards()}>
                      <Plus aria-hidden className="size-5" /> Создать из журнала ошибок ({pendingErrorCards.length})
                    </button>
                  )}
                  <ButtonLink to="/syllabus" variant="secondary">
                    Открыть курс
                  </ButtonLink>
                </>
              }
            />
          </section>
        ) : (
          <section className="card-raised relative isolate overflow-hidden rounded-hero p-6 text-center sm:p-10">
            {due.length > 0 ? (
              <div className="flex flex-col items-center gap-4">
                <AzulejoCorner seed={due.length} />
                <p className="leading-none">
                  <span className="block font-display text-[7rem] leading-[0.8] font-black tabular-nums sm:text-[9rem]">{due.length}</span>
                  <span className="mt-2 block font-display text-2xl">к повторению</span>
                </p>
                <p className="text-ink-muted">
                  {newCount ? (newCount === due.length ? 'Все карточки новые' : `Из них новых: ${newCount}`) : 'Только повторение'}
                  {' · '}≈{Math.max(1, Math.round(due.length * 0.25))} мин
                </p>
                <button className="btn-primary min-h-14 w-full px-12 text-lg sm:w-auto" onClick={start}>
                  Начать
                </button>
              </div>
            ) : (
              <EmptyState
                art="empty-review"
                title="На сегодня всё"
                text={
                  <>
                    {nextDue ? `Следующая карточка через ${formatInterval(nextDue - now)}.` : 'Нет запланированных карточек.'}
                    {newSeenToday(now) >= (data.settings?.newCardsPerDay ?? 15) && ' Лимит новых карточек на сегодня исчерпан.'}
                  </>
                }
              />
            )}
            {pendingErrorCards.length > 0 && (
              <p className="mt-4 text-sm text-ink-muted">
                Ошибок из журнала без карточек: {pendingErrorCards.length}.{' '}
                <button className="min-h-11 font-semibold text-azulejo underline underline-offset-2" onClick={() => void addErrorCards()}>
                  Добавить в повторение
                </button>
              </p>
            )}
          </section>
        )}
      </TabPanel>
    </div>
  )
}

const noop = () => {}
