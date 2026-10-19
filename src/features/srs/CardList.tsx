import { useEffect, useMemo, useRef, useState } from 'react'
import { getTopic } from '@/content'
import { useRepository } from '@/data'
import type { CardKind, SrsCard } from '@/data/types.ts'
import { formatInterval, isNewCard } from '@/engine/fsrs'
import { Pause, Play, Search, SearchX, Trash2 } from 'lucide-react'
import { Chip, ChipGroup } from '@/components/Chip'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/toastContext'
import { KIND_CHIP, KIND_LABEL, KIND_SHORT } from './kinds'
import { deleteCards } from './cardOps'

const KINDS: CardKind[] = ['word', 'phrase', 'grammar', 'error']

interface Props {
  cards: SrsCard[]
  onChanged(): void
}

function dueLabel(c: SrsCard, now: number) {
  if (c.suspended) return 'приостановлена'
  if (isNewCard(c)) return 'новая'
  const d = c.fsrs.due - now
  return d <= 0 ? 'к повторению' : `через ${formatInterval(d)}`
}

/** "Все карточки": filter by kind/topic/text, suspend/resume, delete. */
export function CardList({ cards, onChanged }: Props) {
  const repo = useRepository()
  const [kind, setKind] = useState<CardKind | 'all'>('all')
  const [topicId, setTopicId] = useState<string>('all')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  const toast = useToast()
  /** After a delete: the row that should take focus once the card is gone (`to` undefined → the search box). */
  const refocus = useRef<{ from: string; to?: string } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const topicOptions = useMemo(() => {
    const ids = [...new Set(cards.map((c) => c.topicId).filter((x): x is string => !!x))]
    return ids.map((id) => ({ id, title: getTopic(id)?.title ?? id })).sort((a, b) => a.title.localeCompare(b.title, 'ru'))
  }, [cards])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return cards
      .filter((c) => kind === 'all' || c.kind === kind)
      .filter((c) => topicId === 'all' || (topicId === 'none' ? !c.topicId : c.topicId === topicId))
      .filter((c) => !needle || c.front.toLowerCase().includes(needle) || c.back.toLowerCase().includes(needle))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [cards, kind, topicId, q])

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id)
    try {
      await fn()
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  const kindCount = (k: CardKind) => cards.filter((c) => c.kind === k).length

  /** Delete at once, offer «Отменить» for 5 s (no blocking confirm()). */
  function remove(c: SrsCard) {
    const i = shown.findIndex((x) => x.id === c.id)
    refocus.current = { from: c.id, to: (shown[i + 1] ?? shown[i - 1])?.id }
    void run(c.id, () => deleteCards(repo, [c])).then(() =>
      toast({
        text: `Карточка «${c.front.slice(0, 40)}» удалена`,
        action: { label: 'Отменить', onClick: () => void run(c.id, () => repo.upsertCards([c])) },
      }),
    )
  }

  // The deleted row unmounts with its focused button: move focus to the neighbouring row instead of <body>.
  useEffect(() => {
    const r = refocus.current
    if (!r || shown.some((c) => c.id === r.from)) return
    refocus.current = null
    const next = r.to ? document.querySelector<HTMLElement>(`[data-delete-card="${CSS.escape(r.to)}"]`) : null
    const target = next ?? searchRef.current
    target?.focus()
  }, [shown])

  const iconBtn =
    'btn-ghost btn-icon'

  return (
    <section className="space-y-3">
      <ChipGroup label="Тип карточек">
        {(['all', ...KINDS] as const).map((k) => (
          <Chip key={k} pressed={kind === k} onClick={() => setKind(k)} count={k === 'all' ? cards.length : kindCount(k)}>
            {k === 'all' ? 'Все' : KIND_SHORT[k]}
          </Chip>
        ))}
      </ChipGroup>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="sr-only" htmlFor="cards-topic">
          Тема
        </label>
        <select id="cards-topic" className="input" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          <option value="all">Все темы</option>
          <option value="none">Без темы</option>
          {topicOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <div className="relative">
          <label className="sr-only" htmlFor="cards-q">
            Поиск по карточкам
          </label>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-ink-muted" />
          <input ref={searchRef} id="cards-q" className="input pl-10" type="search" placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState compact icon={<SearchX className="size-5" />} tone="neutral" title="Нет карточек под фильтр" />
      ) : (
        <ul className="card divide-y divide-line p-0">
          {shown.map((c) => (
            <li key={c.id} className={`flex items-start gap-2 py-2.5 pr-1.5 pl-4 ${c.suspended ? 'opacity-60' : ''}`}>
              <div className="min-w-0 flex-1 py-0.5">
                <p className="truncate font-semibold">{c.front}</p>
                <p lang="pt-PT" className="truncate text-sm text-brand-ink">
                  {c.back}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
                  <span className={`rounded-full px-1.5 py-px font-semibold ${KIND_CHIP[c.kind]}`}>{KIND_LABEL[c.kind]}</span>
                  <span>{dueLabel(c, now)}</span>
                  {c.fsrs.lapses > 0 && <span>· ошибок {c.fsrs.lapses}</span>}
                  {c.topicId && <span className="truncate">· {getTopic(c.topicId)?.title ?? c.topicId}</span>}
                </p>
              </div>
              <div className="flex shrink-0">
                <button
                  className={iconBtn}
                  disabled={busy === c.id}
                  title={c.suspended ? 'Вернуть в повторение' : 'Приостановить'}
                  aria-label={c.suspended ? `Вернуть «${c.front}» в повторение` : `Приостановить «${c.front}»`}
                  onClick={() => void run(c.id, () => repo.upsertCards([{ ...c, suspended: !c.suspended, updatedAt: Date.now() }]))}
                >
                  {c.suspended ? <Play aria-hidden /> : <Pause aria-hidden />}
                </button>
                <button
                  className={`${iconBtn} hover:bg-danger-soft hover:text-danger`}
                  disabled={busy === c.id}
                  title="Удалить"
                  data-delete-card={c.id}
                  aria-label={`Удалить «${c.front}»`}
                  onClick={() => remove(c)}
                >
                  <Trash2 aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
