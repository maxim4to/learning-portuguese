import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GraduationCap, Layers, Plus } from 'lucide-react'
import { LEVELS, getReadingText, getSituation, getTopic, getVocabTheme, type Level } from '@/content'
import { ButtonLink } from '@/components/Button'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { AzulejoCorner } from '@/components/Card'
import { cx } from '@/components/cx'
import { SegmentedControl } from '@/components/SegmentedControl'
import { TabPanel, Tabs } from '@/components/Tabs'
import { useRepository } from '@/data'
import type { SrsCard, WordStatus } from '@/data/types.ts'
import { dueCards, formatInterval, isNewCard, type ReviewRating } from '@/engine/fsrs'
import { useProgressData } from '@/features/dashboard/useProgressData'
import { activityDays, computeStreak } from '@/features/dashboard/stats'
import { plural } from '@/features/library/format'
import { ReviewTabs } from '@/features/words/ReviewTabs'
import { learnCandidates, learnCount } from '@/features/words/learn'
import { WORD_STATUS_LABEL } from '@/features/words/status'
import { useWordActions, useWords, type WordsSnapshot } from '@/features/words/useWords'
import { CardList } from './CardList'
import { cardsFromErrors, isDeleted } from './cardOps'
import { newSeenToday } from './newCardCounter'
import { ReviewSession } from './ReviewSession'

export function ReviewPage() {
  const repo = useRepository()
  const data = useProgressData()
  const dict = useWords()
  const wordCount = dict.counts.total
  const { onCardReviewed, reload: reloadWords } = useWordActions()
  // Keep the dictionary cache (statuses, next review) in step with cards rated in the session, and open the
  // word's next card modes (staged unlock).
  const onCardUpdated = useCallback((c: SrsCard, r: ReviewRating) => void onCardReviewed(c, r).catch(() => {}), [onCardReviewed])
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'all' ? 'all' : 'session'
  const wordsOnly = params.get('deck') === 'words'
  const [session, setSession] = useState<SrsCard[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const cards = useMemo(() => data.cards.filter((c) => !isDeleted(c)), [data.cards])
  const [now, setNow] = useState(() => Date.now())
  const dueOpts = useCallback(
    (t: number) => ({ newPerDay: data.settings?.newCardsPerDay, newSeenToday: newSeenToday(t) }),
    [data.settings],
  )
  const dueAll = useMemo(() => dueCards(cards, now, dueOpts(now)), [cards, now, dueOpts])
  const due = useMemo(() => (wordsOnly ? dueCards(cards, now, { ...dueOpts(now), filter: isWordCard }) : dueAll), [wordsOnly, dueAll, cards, now, dueOpts])
  const wordCardCount = useMemo(() => cards.filter(isWordCard).length, [cards])
  const pendingErrorCards = useMemo(() => cardsFromErrors(data.errors, data.cards), [data.errors, data.cards])

  const { reload } = data
  // "К карточкам" at the end of a session leads to the full card list, not back to the session start screen.
  const finish = useCallback(() => {
    setSession(null)
    setNow(Date.now())
    setParams((p) => withParam(withParam(p, 'tab', 'all'), 'deck', p.get('deck')), { replace: true })
    void reload()
  }, [reload, setParams])

  async function addErrorCards() {
    await repo.upsertCards(pendingErrorCards)
    setMsg(`Добавлено карточек из журнала ошибок: ${pendingErrorCards.length}`)
    await data.reload()
    setNow(Date.now())
  }

  const streak = computeStreak(activityDays(data.progress.values(), data.cards, data.errors), now).streak

  if (data.loading) return <PageSkeleton cards={2} />
  if (data.error) return <ErrorState detail={data.error} onRetry={() => void reload()} />

  if (session) {
    return (
      <div className="page-grid">
        <div className="min-w-0">
          <h1 className="sr-only">Повторение</h1>
          <ReviewSession initial={session} settings={data.settings} onCardUpdated={onCardUpdated} onFinish={finish} />
        </div>
        <DeckPanel cards={cards} due={dueAll} now={now} newLimit={data.settings?.newCardsPerDay ?? 15} streak={streak} dict={dict} actions={false} className="hidden lg:flex" />
      </div>
    )
  }

  const nextDue = cards
    .filter((c) => !c.suspended && !isNewCard(c) && c.fsrs.due > now)
    .reduce<number | null>((m, c) => (m === null || c.fsrs.due < m ? c.fsrs.due : m), null)
  const newCount = due.filter(isNewCard).length
  const start = () => {
    const t = Date.now()
    setSession(dueCards(cards, t, { ...dueOpts(t), filter: wordsOnly ? isWordCard : undefined }))
  }
  const setTab = (t: 'session' | 'all') => setParams((p) => withParam(p, 'tab', t === 'all' ? 'all' : null), { replace: true })
  const setDeck = (d: 'all' | 'words') => setParams((p) => withParam(p, 'deck', d === 'words' ? 'words' : null), { replace: true })

  return (
    <div className="page">
      <div className="space-y-4">
        <ReviewTabs active="review" wordCount={wordCount} />
        <PageHeader title="Повторение" subtitle="Интервальное повторение: карточки возвращаются, когда пора вспомнить." />
      </div>

      <div className="page-grid">
      <div className="min-w-0 space-y-4">

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
        {tab === 'all' && (
          <CardList
            cards={cards}
            onChanged={() => {
              void reload()
              void reloadWords() // a deleted / paused lex:* card changes the dictionary's statuses
            }}
          />
        )}
      </TabPanel>

      <TabPanel idBase="review" value="session" active={tab === 'session'}>
        {cards.length === 0 ? (
          <section className="card">
            <EmptyState
              icon={<Layers className="size-7" />}
              tone="azulejo"
              title="Карточек пока нет"
              text="Они появляются, когда вы сохраняете слова в «Мой словарь» или нажимаете «в повторение» у фраз и примеров. Ошибки из упражнений попадают в журнал ошибок."
              action={
                <>
                  {pendingErrorCards.length > 0 && (
                    <button className="btn-primary" onClick={() => void addErrorCards()}>
                      <Plus aria-hidden /> Создать из журнала ошибок ({pendingErrorCards.length})
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
          <div className="space-y-4">
          {wordCardCount > 0 && (
            <SegmentedControl<'all' | 'words'>
              label="Какие карточки повторять"
              size="sm"
              value={wordsOnly ? 'words' : 'all'}
              onChange={setDeck}
              options={[
                { value: 'all', label: `Все карточки · ${dueAll.length}` },
                { value: 'words', label: `Только слова · ${dueCards(cards, now, { ...dueOpts(now), filter: isWordCard }).length}` },
              ]}
            />
          )}
          <section data-halftone-surface="" className="card-raised relative isolate overflow-hidden text-center">
            {due.length > 0 ? (
              <div className="flex flex-col items-center gap-4">
                <AzulejoCorner />
                <p className="flex items-baseline gap-2.5">
                  <span className="font-display text-h1 leading-none font-black tabular-nums">{due.length}</span>
                  <span className="font-display text-h2">{wordsOnly ? plural(due.length, 'слово', 'слова', 'слов').replace(/^\d+\s/, '') : 'к повторению'}</span>
                </p>
                <p className="text-ink-muted">
                  {newCount ? (newCount === due.length ? 'Все карточки новые' : `Из них новых: ${newCount}`) : 'Только повторение'}
                  {' · '}≈{Math.max(1, Math.round(due.length * 0.25))} мин
                </p>
                <button className="btn-primary w-full sm:w-auto sm:min-w-40" onClick={start}>
                  Начать
                </button>
              </div>
            ) : (
              <EmptyState
                art="empty-review"
                title={wordsOnly ? 'Слов к повторению нет' : 'На сегодня всё'}
                text={
                  <>
                    {nextDue ? `Следующая карточка через ${formatInterval(nextDue - now)}.` : 'Нет запланированных карточек.'}
                    {newSeenToday(now) >= (data.settings?.newCardsPerDay ?? 15) && ' Лимит новых карточек на сегодня исчерпан.'}
                    {wordsOnly && ' Новые слова из «Моего словаря» можно выучить в «Учить новые».'}
                  </>
                }
              />
            )}
            {pendingErrorCards.length > 0 && (
              <p className="mt-4 text-sm text-ink-muted">
                Ошибок из журнала без карточек: {pendingErrorCards.length}.{' '}
                <button className="btn-ghost btn-sm text-ink" onClick={() => void addErrorCards()}>
                  Добавить в повторение
                </button>
              </p>
            )}
          </section>
          </div>
        )}
      </TabPanel>
      </div>

      <DeckPanel cards={cards} due={dueAll} now={now} newLimit={data.settings?.newCardsPerDay ?? 15} streak={streak} dict={dict} />
      </div>
    </div>
  )
}

const isWordCard = (c: SrsCard) => !!c.wordId
const WORD_STATUSES: WordStatus[] = ['new', 'learning', 'known', 'paused']

/** Copy of search params with `key` set (or removed for null). */
function withParam(p: URLSearchParams, key: string, value: string | null): URLSearchParams {
  const n = new URLSearchParams(p)
  if (value === null) n.delete(key)
  else n.set(key, value)
  return n
}

/** Level of a card's source (topic, situation, vocab theme or reading text; the word's level for dictionary cards). */
function cardLevel(c: SrsCard, dict: WordsSnapshot): Level | undefined {
  if (c.wordId) return dict.index.byId.get(c.wordId)?.level
  const id = c.topicId
  if (!id) return undefined
  return getTopic(id)?.level ?? getSituation(id)?.level ?? getVocabTheme(id)?.level ?? getReadingText(id)?.level
}

/** Side panel: the deck in numbers (real data; zeros print as 0, unknown as a dash). */
function DeckPanel({
  cards,
  due,
  now,
  newLimit,
  streak,
  dict,
  actions = true,
  className,
}: {
  cards: SrsCard[]
  due: SrsCard[]
  now: number
  newLimit: number
  streak: number
  dict: WordsSnapshot
  /** «Учить новые» / «Повторить слова» (hidden beside a running session). */
  actions?: boolean
  className?: string
}) {
  const active = cards.filter((c) => !c.suspended)
  const suspended = cards.length - active.length
  const dueIds = new Set(due.map((c) => c.id))
  const nextDue = active
    .filter((c) => !isNewCard(c) && c.fsrs.due > now)
    .reduce<number | null>((m, c) => (m === null || c.fsrs.due < m ? c.fsrs.due : m), null)
  const seen = newSeenToday(now)
  const byLevel = new Map<Level | 'none', { total: number; due: number }>()
  for (const c of active) {
    const k = cardLevel(c, dict) ?? 'none'
    const row = byLevel.get(k) ?? { total: 0, due: 0 }
    row.total++
    if (dueIds.has(c.id)) row.due++
    byLevel.set(k, row)
  }
  const levelRows: { key: Level | 'none'; label: string }[] = [
    ...LEVELS.map((l) => ({ key: l, label: l })),
    ...(byLevel.has('none') ? [{ key: 'none' as const, label: 'Без уровня' }] : []),
  ]
  const row = 'flex items-baseline justify-between gap-3 py-1.5'
  const num = 'font-semibold text-ink tabular-nums'
  const wordsReady = dict.status === 'ready'
  const wordDue = due.filter((c) => c.wordId)
  const wordDueReviews = wordDue.filter((c) => !isNewCard(c)).length
  const learnable = learnCandidates(dict.words, dict.cardsByWord, dict.statuses).length
  const toLearn = learnCount(learnable, newLimit, seen)
  const wv = (n: number) => (wordsReady ? n : '—')
  const wnum = (n: number) => cx(num, wordsReady && n === 0 && 'font-normal text-ink-muted')

  return (
    <aside aria-labelledby="deck-title" className={cx('card flex-col gap-4', className ?? 'flex')}>
      <h2 id="deck-title">Колода</h2>
      <dl className="text-sm text-ink-muted">
        <div className={row}>
          <dt>К повторению сейчас</dt>
          <dd className={num}>{due.length}</dd>
        </div>
        <div className={row}>
          <dt>Новых сегодня</dt>
          <dd className={num}>
            {seen} <span className="font-normal text-ink-muted">/ {newLimit}</span>
          </dd>
        </div>
        <div className={row}>
          <dt>Следующая карточка</dt>
          <dd className={num}>{nextDue ? `через ${formatInterval(nextDue - now)}` : '—'}</dd>
        </div>
        <div className={row}>
          <dt>Серия занятий</dt>
          <dd className={num}>{streak ? plural(streak, 'день', 'дня', 'дней') : '0 дней'}</dd>
        </div>
      </dl>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink-muted">По уровням</h3>
        <table className="w-full text-sm">
          <thead className="sr-only">
            <tr>
              <th>Уровень</th>
              <th>Всего</th>
              <th>К повторению</th>
            </tr>
          </thead>
          <tbody>
            {levelRows.map(({ key, label }) => {
              const r = byLevel.get(key) ?? { total: 0, due: 0 }
              return (
                <tr key={key}>
                  <td className="py-1.5 font-semibold">{label}</td>
                  <td className="py-1.5 text-right text-ink-muted tabular-nums">{plural(r.total, 'карточка', 'карточки', 'карточек')}</td>
                  <td className={cx('w-24 py-1.5 text-right tabular-nums', r.due ? 'font-semibold text-ink' : 'text-ink-muted')}>
                    {r.due ? `${r.due} сейчас` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {(dict.counts.total > 0 || !wordsReady) && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-ink-muted">Мой словарь</h3>
          <dl className="text-sm text-ink-muted">
            {WORD_STATUSES.map((st) => (
              <div key={st} className={row}>
                <dt>{WORD_STATUS_LABEL[st]}</dt>
                <dd className={wnum(dict.counts[st])}>{wv(dict.counts[st])}</dd>
              </div>
            ))}
            <div className={row}>
              <dt>Слов к повторению сейчас</dt>
              <dd className={wnum(wordDueReviews)}>{wv(wordDueReviews)}</dd>
            </div>
            <div className={row}>
              <dt>Новых слов ждут</dt>
              <dd className={wnum(learnable)}>{wv(learnable)}</dd>
            </div>
          </dl>
          {wordsReady && actions && (
            <div className="flex flex-wrap gap-2 pt-2">
              {toLearn > 0 && (
                <ButtonLink to="/words?learn=1" size="sm" icon={<GraduationCap />}>
                  Учить новые ({toLearn})
                </ButtonLink>
              )}
              {wordDue.length > 0 && (
                <ButtonLink to="/review?deck=words" size="sm" variant="secondary">
                  Повторить слова
                </ButtonLink>
              )}
            </div>
          )}
        </div>
      )}

      <p className="rounded-control bg-surface-2 p-4 text-sm text-ink-muted">
        Всего {plural(cards.length, 'карточка', 'карточки', 'карточек')}
        {suspended > 0 && `, приостановлено ${suspended}`}. Новых в день — не больше {newLimit}, лимит меняется в настройках.
      </p>
    </aside>
  )
}
