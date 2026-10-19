import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookA, GraduationCap, Layers, Search } from 'lucide-react'
import { Button, ButtonLink } from '@/components/Button'
import { cx } from '@/components/cx'
import { ProgressBar } from '@/components/ProgressBar'
import type { WordStatus } from '@/data'
import { isNewCard } from '@/engine/fsrs'
import { plural } from '@/features/library/format'
import { practicePath } from '@/features/practice/paths'
import { newSeenToday } from '@/features/srs/newCardCounter'
import { useWordCapture } from './capture/context.ts'
import { learnCandidates, learnCount } from './learn.ts'
import { WORD_STATUS_LABEL } from './status.ts'
import { useWords } from './useWords.ts'
import { wordPt } from './wordOps.ts'

const RECENT = 4
const DOT: Record<WordStatus, string> = {
  new: 'bg-surface ring-[1.5px] ring-inset ring-line-strong',
  learning: 'bg-sun-fill ring-1 ring-inset ring-ink/35',
  known: 'bg-brand',
  paused: 'bg-ink-subtle',
}
const BAR: Record<WordStatus, string> = {
  new: 'bg-ink-subtle/35',
  learning: 'bg-sun-fill',
  known: 'bg-brand',
  paused: 'bg-ink-subtle',
}
const ORDER: WordStatus[] = ['new', 'learning', 'known', 'paused']
const wordHref = (id: string) => `/words/${encodeURIComponent(id)}`

/**
 * Dashboard «Мой словарь»: what the dictionary asks for today (words due, new words waiting → «Учить новые»), the
 * words by status and the last added ones. Empty: how words get here (tap any pt word). The day's total card count
 * stays in the hero above; this card only speaks about words.
 */
export function WordsWidget({ now, newPerDay }: { now: number; newPerDay: number }) {
  const dict = useWords()
  const capture = useWordCapture()

  const view = useMemo(() => {
    const dueWords = new Set<string>()
    for (const c of dict.cards) if (c.wordId && !c.suspended && !isNewCard(c) && c.fsrs.due <= now) dueWords.add(c.wordId)
    const waiting = learnCandidates(dict.words, dict.cardsByWord, dict.statuses).length
    return { due: dueWords.size, waiting, toLearn: learnCount(waiting, newPerDay, newSeenToday(now)) }
  }, [dict.cards, dict.words, dict.cardsByWord, dict.statuses, now, newPerDay])

  if (dict.status !== 'ready') return null
  const { counts } = dict
  const total = counts.total

  if (total === 0) {
    return (
      <section className="card grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" aria-labelledby="dash-words">
        <div className="flex gap-4">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-ink">
            <BookA className="size-5" />
          </span>
          <div className="space-y-1">
            <h2 id="dash-words">Мой словарь пока пуст</h2>
            <p className="max-w-[60ch] text-sm text-ink-muted">
              Нажмите на любое португальское слово — в диалоге, тексте, примере или после ответа в упражнении — и выберите
              «Добавить в словарь». Слово уйдёт в повторение, а в текстах будет отмечено, пока вы его учите.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 max-md:pl-15">
          <ButtonLink to={practicePath('situations')} variant="secondary" size="sm">
            Открыть диалоги
          </ButtonLink>
          {capture && (
            <Button variant="ghost" size="sm" icon={<Search />} onClick={capture.openSearch}>
              Найти слово
            </Button>
          )}
        </div>
      </section>
    )
  }

  const recent = dict.words.slice(0, RECENT)
  const limitHit = view.waiting > 0 && view.toLearn === 0
  return (
    <section className="card grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-12" aria-labelledby="dash-words">
      <div className="flex flex-col gap-4">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <h2 id="dash-words">Мой словарь</h2>
          <Link to="/words" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold whitespace-nowrap">
            Все слова <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>

        <div className="space-y-3">
          <p className="flex items-baseline gap-2.5">
            <span className="font-display text-h1 leading-none font-black tabular-nums">{total}</span>
            <span className="font-display text-h2">{plural(total, 'слово', 'слова', 'слов').replace(/^\d+\s/, '')}</span>
          </p>
          <ProgressBar
            size="md"
            label={`Слов в словаре: ${total}`}
            segments={ORDER.map((s) => ({ value: counts[s] / total, className: BAR[s], title: `${WORD_STATUS_LABEL[s]}: ${counts[s]}` }))}
          />
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted" aria-label="Слова по статусам">
            {ORDER.filter((s) => s !== 'paused' || counts.paused > 0).map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <i aria-hidden className={cx('inline-block size-2.5 rounded-full', DOT[s])} />
                {WORD_STATUS_LABEL[s]}
                <span className={cx('tabular-nums', counts[s] ? 'font-semibold text-ink' : '')}>{counts[s]}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="pt-2 text-sm text-ink-muted">
          {view.due ? `Сегодня к повторению: ${plural(view.due, 'слово', 'слова', 'слов')}` : 'Слов к повторению сегодня нет'}
          {view.waiting > 0 && ` · новых ждут: ${view.waiting}`}
          {limitHit && ' (лимит новых на сегодня исчерпан)'}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {view.toLearn > 0 && (
            <ButtonLink to="/words?learn=1" variant="secondary" size="sm" icon={<GraduationCap />}>
              Учить новые ({view.toLearn})
            </ButtonLink>
          )}
          <ButtonLink to="/review?deck=words" variant={view.toLearn > 0 ? 'ghost' : 'secondary'} size="sm" icon={<Layers />}>
            {view.due ? `Повторить слова (${view.due})` : 'Повторить слова'}
          </ButtonLink>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="flex min-h-11 items-center text-sm font-semibold text-ink-muted">Недавно добавлены</h3>
        <ul className="-mx-3 space-y-1">
          {recent.map((w) => {
            const s = dict.statuses.get(w.id) ?? 'new'
            return (
              <li key={w.id}>
                <Link
                  to={wordHref(w.id)}
                  className="group flex min-h-12 items-center gap-3 rounded-control px-3 py-2 text-ink no-underline transition-colors hover:bg-surface-2"
                >
                  <i aria-hidden title={WORD_STATUS_LABEL[s]} className={cx('size-2.5 shrink-0 rounded-full', DOT[s])} />
                  <span className="min-w-0 flex-1">
                    <span lang="pt-PT" className="block truncate font-semibold">
                      {wordPt(w)}
                    </span>
                    <span className="block truncate text-sm text-ink-muted">{w.ru}</span>
                  </span>
                  <span className="sr-only">{WORD_STATUS_LABEL[s]}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
