import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BookA, Plus, Search, SearchX } from 'lucide-react'
import { LEVELS, type Level } from '@/content'
import { Button, ButtonLink } from '@/components/Button'
import { Chip, ChipGroup } from '@/components/Chip'
import { cx } from '@/components/cx'
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { useToast } from '@/components/toastContext'
import type { WordEntry, WordStatus } from '@/data'
import { isNewCard } from '@/engine/fsrs'
import { normalize, stripAccents } from '@/engine/grading'
import { plural } from '@/features/library/format'
import { ReviewTabs } from './ReviewTabs.tsx'
import { SOURCE_GROUP_LABEL, sourceGroup, type SourceGroup } from './source.ts'
import { WORD_STATUS_LABEL } from './status.ts'
import { useWordActions, useWords, type WordActionResult, type WordsSnapshot } from './useWords.ts'
import { WordEditor } from './WordEditor.tsx'
import { WordList } from './WordList.tsx'
import { WordSearchDialog } from './WordSearchDialog.tsx'
import { wordPt } from './wordOps.ts'

const STATUSES: WordStatus[] = ['new', 'learning', 'known', 'paused']
const STATUS_CHIP: Record<WordStatus, string> = { new: 'Новые', learning: 'Учу', known: 'Знаю', paused: 'На паузе' }
const SOURCE_FILTERS: (SourceGroup | 'nolex')[] = ['vocab', 'situation', 'reading', 'other', 'manual', 'nolex']
type LevelFilter = Level | 'none' | 'all'
type SourceFilter = SourceGroup | 'nolex' | 'all'

const fold = (s: string) => stripAccents(normalize(s)).replace(/ё/g, 'е')

function matchesQuery(w: WordEntry, q: string): boolean {
  if (!q) return true
  return fold(wordPt(w)).includes(q) || fold(w.ru).includes(q) || (!!w.note && fold(w.note).includes(q))
}

function matchesSource(w: WordEntry, f: SourceFilter): boolean {
  if (f === 'all') return true
  if (f === 'nolex') return !w.lexId
  return w.sources.some((s) => sourceGroup(s.src) === f) || (f === 'manual' && w.sources.length === 0)
}

/** «Мой словарь» (/words): saved words with search, filters, counts, add / edit / delete / «Знаю». */
export function WordsPage() {
  const dict = useWords()
  const actions = useWordActions()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(() => params.get('add') === '1')
  const [editing, setEditing] = useState<WordEntry | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  const searchRef = useRef<HTMLInputElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const addRefPhone = useRef<HTMLButtonElement>(null)
  const refocus = useRef<{ from: string; to?: string } | null>(null)

  const rawStatus = params.get('status') as WordStatus | null
  const status: WordStatus | 'all' = rawStatus && STATUSES.includes(rawStatus) ? rawStatus : 'all'
  const rawLevel = params.get('level')
  const level: LevelFilter = rawLevel === 'none' || (LEVELS as readonly string[]).includes(rawLevel ?? '') ? (rawLevel as LevelFilter) : 'all'
  const rawSource = params.get('source') as SourceFilter | null
  const source: SourceFilter = rawSource && (SOURCE_FILTERS as string[]).includes(rawSource) ? rawSource : 'all'
  const setFilter = (key: 'status' | 'level' | 'source' | 'add', value: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (value === 'all') n.delete(key)
        else n.set(key, value)
        n.delete('add')
        return n
      },
      { replace: true },
    )

  const needle = fold(q.trim())
  // Search, level and source narrow the list first; the status chips count within that view.
  const scoped = useMemo(
    () =>
      dict.words.filter(
        (w) =>
          matchesQuery(w, needle) &&
          (level === 'all' || (level === 'none' ? !w.level : w.level === level)) &&
          matchesSource(w, source),
      ),
    [dict.words, needle, level, source],
  )
  const shown = useMemo(
    () => (status === 'all' ? scoped : scoped.filter((w) => dict.statuses.get(w.id) === status)),
    [scoped, status, dict.statuses],
  )
  const scopedCounts = useMemo(() => {
    const c: Record<WordStatus, number> = { new: 0, learning: 0, known: 0, paused: 0 }
    for (const w of scoped) c[dict.statuses.get(w.id) ?? 'new']++
    return c
  }, [scoped, dict.statuses])

  // The removed row unmounts with its focused menu button: focus the neighbour's menu (or the search box).
  useEffect(() => {
    const r = refocus.current
    if (!r || shown.some((w) => w.id === r.from)) return
    refocus.current = null
    const next = r.to ? document.querySelector<HTMLElement>(`[data-word-menu="${CSS.escape(r.to)}"]`) : null
    ;(next ?? searchRef.current)?.focus()
  }, [shown])

  async function run(w: WordEntry, fn: () => Promise<WordActionResult>, text: string) {
    setBusyId(w.id)
    try {
      const { undo } = await fn()
      toast({ text, action: { label: 'Отменить', onClick: () => void undo().catch(() => toast({ text: 'Не удалось отменить', tone: 'danger' })) } })
    } catch (e) {
      toast({ text: `Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`, tone: 'danger' })
    } finally {
      setBusyId(null)
    }
  }

  function remove(w: WordEntry) {
    const i = shown.findIndex((x) => x.id === w.id)
    refocus.current = { from: w.id, to: (shown[i + 1] ?? shown[i - 1])?.id }
    void run(w, () => actions.deleteWords([w.id]), `Удалено из словаря: ${wordPt(w)}`)
  }

  function toggleKnown(w: WordEntry) {
    if (w.mark === 'known') void run(w, () => actions.unmarkKnown(w.id), `Снова учу: ${wordPt(w)}`)
    else void run(w, () => actions.markKnown(w.id), `Отмечено как известное: ${wordPt(w)}`)
  }

  function closeAdd() {
    setAdding(false)
    if (params.has('add')) setFilter('add', 'all')
  }

  function onAdded(r: WordActionResult) {
    closeAdd()
    const w = r.words[0]
    toast({
      text: w ? `Добавлено в словарь: ${wordPt(w)}` : 'Добавлено в словарь',
      tone: 'success',
      action: { label: 'Отменить', onClick: () => void r.undo() },
    })
  }

  const empty = dict.status === 'ready' && dict.counts.total === 0
  const filtered = status !== 'all' || level !== 'all' || source !== 'all' || needle !== ''

  return (
    <div className="page">
      <div className="space-y-4">
        <ReviewTabs active="words" wordCount={dict.counts.total} />
        <PageHeader
          title="Мой словарь"
          subtitle="Слова из тем, ситуаций и поиска. Каждое слово — карточка в повторении."
          actions={
            dict.status === 'ready' && !empty ? (
              <Button ref={addRef} icon={<Plus />} className="max-lg:hidden" onClick={() => setAdding(true)}>
                Добавить слово
              </Button>
            ) : undefined
          }
        />
      </div>

      {dict.status === 'error' ? (
        <ErrorState text="Не удалось загрузить словарь" detail={dict.error ?? undefined} onRetry={() => void actions.reload()} />
      ) : (
        <div className="page-grid">
          <div className="min-w-0 space-y-4">
            {dict.status === 'loading' ? (
              <div role="status" aria-label="Загрузка словаря" className="space-y-4">
                <Skeleton className="h-11 rounded-pill" />
                <Skeleton className="h-9 w-2/3 rounded-pill" />
                <Skeleton className="h-72" />
              </div>
            ) : empty ? (
              <section className="card" aria-labelledby="words-empty">
                <EmptyState
                  icon={<BookA className="size-7" />}
                  tone="azulejo"
                  title={<span id="words-empty">Словарь пока пуст</span>}
                  text="Сохраняйте слова кнопкой «в словарь» в темах библиотеки и в лексике ситуаций — или найдите слово здесь. Если его нет в приложении, добавьте со своим переводом."
                  action={
                    <>
                      <Button ref={addRef} icon={<Plus />} onClick={() => setAdding(true)}>
                        Добавить слово
                      </Button>
                      <ButtonLink to="/library" variant="secondary">
                        Темы библиотеки
                      </ButtonLink>
                    </>
                  }
                />
              </section>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1fr)_10rem_13rem]">
                  <div className="col-span-2 flex gap-2 lg:contents">
                  <div className="relative min-w-0 flex-1">
                    <label className="sr-only" htmlFor="words-q">
                      Поиск по словарю
                    </label>
                    <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-ink-muted" />
                    <input
                      ref={searchRef}
                      id="words-q"
                      type="search"
                      className="input pl-11"
                      placeholder="Поиск: pt или ru"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <Button ref={addRefPhone} icon={<Plus />} className="shrink-0 max-sm:btn-icon lg:hidden" aria-label="Добавить слово" onClick={() => setAdding(true)}>
                    <span className="max-sm:hidden">Добавить слово</span>
                  </Button>
                  </div>
                  <label className="sr-only" htmlFor="words-level">
                    Уровень
                  </label>
                  <select id="words-level" className="input pr-3 pl-4" value={level} onChange={(e) => setFilter('level', e.target.value)}>
                    <option value="all">Все уровни</option>
                    {LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l} · {dict.words.filter((w) => w.level === l).length}
                      </option>
                    ))}
                    <option value="none">Без уровня · {dict.words.filter((w) => !w.level).length}</option>
                  </select>
                  <label className="sr-only" htmlFor="words-source">
                    Источник
                  </label>
                  <select id="words-source" className="input pr-3 pl-4" value={source} onChange={(e) => setFilter('source', e.target.value)}>
                    <option value="all">Все источники</option>
                    {SOURCE_FILTERS.map((s) => (
                      <option key={s} value={s}>
                        {s === 'nolex' ? 'Нет в словаре приложения' : SOURCE_GROUP_LABEL[s]} · {dict.words.filter((w) => matchesSource(w, s)).length}
                      </option>
                    ))}
                  </select>
                </div>

                <ChipGroup
                  label="Статус"
                  className="-mx-4 px-4 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:scroll-fade-x sm:mx-0 sm:px-0"
                >
                  <Chip pressed={status === 'all'} count={scoped.length} onClick={() => setFilter('status', 'all')}>
                    Все
                  </Chip>
                  {STATUSES.map((s) => (
                    <Chip key={s} pressed={status === s} count={scopedCounts[s]} muted={!scopedCounts[s]} onClick={() => setFilter('status', s)}>
                      {STATUS_CHIP[s]}
                    </Chip>
                  ))}
                </ChipGroup>

                <p className="sr-only" role="status">
                  {filtered ? `Показано ${plural(shown.length, 'слово', 'слова', 'слов')} из ${dict.counts.total}` : ''}
                </p>

                {shown.length === 0 ? (
                  <div className="card">
                    <EmptyState
                      compact
                      icon={<SearchX className="size-5" />}
                      tone="neutral"
                      title="Нет слов под этот фильтр"
                      action={
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setQ('')
                            setParams({}, { replace: true })
                            searchRef.current?.focus()
                          }}
                        >
                          Сбросить фильтры
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <WordList
                    words={shown}
                    statuses={dict.statuses}
                    cardsByWord={dict.cardsByWord}
                    now={now}
                    busyId={busyId}
                    onEdit={setEditing}
                    onToggleKnown={toggleKnown}
                    onDelete={remove}
                  />
                )}
              </>
            )}
          </div>

          <DictionaryPanel dict={dict} now={now} />
        </div>
      )}

      {adding && <WordSearchDialog onClose={closeAdd} onAdded={onAdded} />}
      {editing && <WordEditor word={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** Side panel: the dictionary in numbers (zeros print as 0, unknown as a dash). */
function DictionaryPanel({ dict, now }: { dict: WordsSnapshot; now: number }) {
  const loading = dict.status !== 'ready'
  const active = dict.cards.filter((c) => !c.suspended)
  const fresh = active.filter(isNewCard).length
  const due = active.filter((c) => !isNewCard(c) && c.fsrs.due <= now).length
  const noLex = dict.words.filter((w) => !w.lexId).length
  const row = 'flex items-baseline justify-between gap-3 py-1.5'
  const num = 'font-semibold text-ink tabular-nums'
  const v = (n: number) => (loading ? '—' : n)
  const numOf = (n: number) => cx(num, !loading && n === 0 && 'font-normal text-ink-muted')

  return (
    <aside aria-labelledby="dict-panel-title" className="card flex flex-col gap-4">
      <h2 id="dict-panel-title">Словарь</h2>
      <dl className="text-sm text-ink-muted">
        <div className={row}>
          <dt>Всего слов</dt>
          <dd className={numOf(dict.counts.total)}>{v(dict.counts.total)}</dd>
        </div>
        {STATUSES.map((s) => (
          <div key={s} className={row}>
            <dt>{WORD_STATUS_LABEL[s]}</dt>
            <dd className={numOf(dict.counts[s])}>{v(dict.counts[s])}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink-muted">Карточки слов</h3>
        <dl className="text-sm text-ink-muted">
          <div className={row}>
            <dt>Ждут первого повторения</dt>
            <dd className={numOf(fresh)}>{v(fresh)}</dd>
          </div>
          <div className={row}>
            <dt>Пора повторить</dt>
            <dd className={numOf(due)}>{v(due)}</dd>
          </div>
          <div className={row}>
            <dt>Нет в словаре приложения</dt>
            <dd className={numOf(noLex)}>{v(noLex)}</dd>
          </div>
        </dl>
      </div>

      <p className="rounded-control bg-surface-2 p-4 text-sm text-ink-muted">
        Сначала у слова одна карточка PT → RU. RU → PT откроется после первого успешного повторения, «На слух» и
        «Пропуск в предложении» — когда слово продержится 4 дня. Повторяются вместе с остальными карточками.
      </p>
      <ButtonLink to="/review" variant="secondary" size="sm" className="self-start">
        К повторению
      </ButtonLink>
    </aside>
  )
}
