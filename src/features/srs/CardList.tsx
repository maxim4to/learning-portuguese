import { useMemo, useState } from 'react'
import { getTopic } from '@/content'
import { useRepository } from '@/data'
import type { CardKind, SrsCard } from '@/data/types.ts'
import { formatInterval, isNewCard } from '@/engine/fsrs'
import { KIND_CHIP, KIND_LABEL } from './kinds'
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

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(['all', ...KINDS] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-full border px-3 py-1 text-sm ${
              kind === k
                ? 'border-brand-700 bg-brand-700 text-white'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200'
            }`}
          >
            {k === 'all' ? `Все ${cards.length}` : `${KIND_LABEL[k]} ${kindCount(k)}`}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select className="input" value={topicId} onChange={(e) => setTopicId(e.target.value)} aria-label="Тема">
          <option value="all">Все темы</option>
          <option value="none">Без темы</option>
          {topicOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <input className="input" type="search" placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-500">Нет карточек под фильтр.</p>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
          {shown.map((c) => (
            <li key={c.id} className={`flex items-start gap-3 p-3 ${c.suspended ? 'opacity-60' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.front}</p>
                <p lang="pt-PT" className="truncate text-sm text-brand-800 dark:text-brand-100">
                  {c.back}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
                  <span className={`rounded-full px-1.5 py-px ${KIND_CHIP[c.kind]}`}>{KIND_LABEL[c.kind]}</span>
                  <span>{dueLabel(c, now)}</span>
                  {c.fsrs.lapses > 0 && <span>· ошибок {c.fsrs.lapses}</span>}
                  {c.topicId && <span className="truncate">· {getTopic(c.topicId)?.title ?? c.topicId}</span>}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  className="rounded-lg px-2 py-1 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                  disabled={busy === c.id}
                  title={c.suspended ? 'Вернуть в повторение' : 'Приостановить'}
                  onClick={() => void run(c.id, () => repo.upsertCards([{ ...c, suspended: !c.suspended, updatedAt: Date.now() }]))}
                >
                  {c.suspended ? '▶︎' : '⏸'}
                  <span className="sr-only">{c.suspended ? 'Вернуть' : 'Приостановить'}</span>
                </button>
                <button
                  className="rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  disabled={busy === c.id}
                  title="Удалить"
                  onClick={() => {
                    if (confirm(`Удалить карточку «${c.front}»?`)) void run(c.id, () => deleteCards(repo, [c]))
                  }}
                >
                  ✕<span className="sr-only">Удалить</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
