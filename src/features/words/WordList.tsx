import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { BookCheck, Ellipsis, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/Badge'
import { cx } from '@/components/cx'
import type { BadgeTone } from '@/components/tones'
import type { SrsCard, WordEntry, WordStatus } from '@/data'
import { formatInterval, isNewCard } from '@/engine/fsrs'
import { WORD_STATUS_LABEL } from './status.ts'
import { sourceTitle, wordHref } from './source.ts'
import { wordPt } from './wordOps.ts'

/** Word status colours follow the topic «temperature»: new = cold stone, learning = sulfur, known = ember. */
const STATUS_STYLE: Record<WordStatus, { tone: BadgeTone; dot: string }> = {
  new: { tone: 'neutral', dot: 'bg-surface ring-[1.5px] ring-inset ring-line-strong' },
  learning: { tone: 'sun', dot: 'bg-sun-fill ring-1 ring-inset ring-ink/35' },
  known: { tone: 'brand', dot: 'bg-brand' },
  paused: { tone: 'neutral', dot: 'bg-ink-subtle' },
}

export function WordStatusBadge({ status, className }: { status: WordStatus; className?: string }) {
  const s = STATUS_STYLE[status]
  return (
    <Badge tone={s.tone} className={className}>
      <i aria-hidden className={cx('size-1.5 rounded-full', s.dot)} />
      {WORD_STATUS_LABEL[status]}
    </Badge>
  )
}

/** «повтор через 3 д», «к повторению», «ещё не повторялось» — from the word's PT→RU card. */
function nextReviewLabel(cards: readonly SrsCard[], status: WordStatus, now: number): string | undefined {
  if (status === 'known' || status === 'paused') return undefined
  const active = cards.filter((c) => !c.suspended)
  if (!active.length) return undefined
  if (active.every(isNewCard)) return undefined
  const due = Math.min(...active.filter((c) => !isNewCard(c)).map((c) => c.fsrs.due))
  return due <= now ? 'пора повторить' : `повтор через ${formatInterval(due - now)}`
}

export interface WordRowActions {
  onEdit(w: WordEntry): void
  onToggleKnown(w: WordEntry): void
  onDelete(w: WordEntry): void
}

/**
 * Dictionary rows: pt (with article) — ru on line 1, source · level · next review on line 2,
 * the status pill and one «⋯» menu (Изменить / Знаю / Удалить) on the right.
 */
export function WordList({
  words,
  statuses,
  cardsByWord,
  now,
  busyId,
  ...actions
}: {
  words: readonly WordEntry[]
  statuses: ReadonlyMap<string, WordStatus>
  cardsByWord: ReadonlyMap<string, readonly SrsCard[]>
  now: number
  busyId?: string | null
} & WordRowActions) {
  return (
    <ul className="card divide-y divide-line p-0" aria-label="Слова">
      {words.map((w) => {
        const status = statuses.get(w.id) ?? 'new'
        const last = w.sources[w.sources.length - 1]
        const from = last ? (sourceTitle(last.src) ?? (last.src.startsWith('manual') ? 'вручную' : undefined)) : undefined
        const next = nextReviewLabel(cardsByWord.get(w.id) ?? [], status, now)
        const meta = [w.level, next, from && (last?.src.startsWith('manual') ? 'добавлено вручную' : `из: ${from}`)].filter(Boolean)
        return (
          <li key={w.id} className="flex items-center gap-2 py-2 pr-2 pl-4 sm:gap-3 sm:pl-5">
            <div className="min-w-0 flex-1 py-1">
              <p className="min-w-0">
                <Link
                  to={wordHref(w.id)}
                  lang="pt-PT"
                  className="font-semibold text-ink no-underline hover:underline hyphens-auto"
                >
                  {wordPt(w)}
                </Link>
                <span aria-hidden className="text-ink-subtle">
                  {' — '}
                </span>
                <span className="text-ink-muted hyphens-auto" lang="ru">
                  {w.ru}
                </span>
              </p>
              {/* Phones: the status leads the meta line (no pill column); from sm it is the pill on the right. */}
              <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted sm:line-clamp-1">
                <span className="sm:hidden">
                  {WORD_STATUS_LABEL[status]}
                  {meta.length > 0 && ' · '}
                </span>
                {meta.join(' · ')}
              </p>
            </div>
            <WordStatusBadge status={status} className="max-sm:hidden" />
            <RowMenu word={w} known={w.mark === 'known'} disabled={busyId === w.id} {...actions} />
          </li>
        )
      })}
    </ul>
  )
}

/** «⋯» actions menu (menu button pattern: ↑/↓, Home/End, Esc returns focus, click outside closes). */
function RowMenu({
  word,
  known,
  disabled,
  onEdit,
  onToggleKnown,
  onDelete,
}: { word: WordEntry; known: boolean; disabled?: boolean } & WordRowActions) {
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const pt = wordPt(word)

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  function toggle() {
    if (!open && btn.current) {
      // Open upwards near the bottom (the phone tab bar / toast live there).
      const r = btn.current.getBoundingClientRect()
      const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bottom-chrome')) || 0
      setUp(r.bottom + 200 > window.innerHeight - chrome)
    }
    setOpen((o) => !o)
  }

  function close(focus = true) {
    setOpen(false)
    if (focus) btn.current?.focus()
  }

  function onKey(e: KeyboardEvent) {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    let n = -1
    if (e.key === 'ArrowDown') n = (i + 1) % items.length
    else if (e.key === 'ArrowUp') n = (i - 1 + items.length) % items.length
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = items.length - 1
    else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    } else if (e.key === 'Tab') {
      close(false)
      return
    }
    if (n < 0) return
    e.preventDefault()
    items[n]?.focus()
  }

  const item =
    'flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-sm font-semibold text-ink outline-none hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none'
  const run = (fn: () => void) => () => {
    close()
    fn()
  }

  return (
    <div ref={wrap} className="relative shrink-0" onKeyDown={open ? onKey : undefined}>
      <button
        ref={btn}
        type="button"
        className="btn-ghost btn-icon"
        aria-label={`Действия: ${pt}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-word-menu={word.id}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            toggle()
          }
        }}
      >
        <Ellipsis aria-hidden />
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={`Действия: ${pt}`}
          className={cx(
            'absolute right-0 z-20 w-56 animate-fade rounded-card border-[1.5px] border-ink bg-surface p-1.5 shadow-raised',
            up ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
        >
          <button type="button" role="menuitem" tabIndex={-1} className={item} onClick={run(() => onEdit(word))}>
            <Pencil aria-hidden className="size-4 text-ink-muted" /> Изменить
          </button>
          <button type="button" role="menuitem" tabIndex={-1} className={item} onClick={run(() => onToggleKnown(word))}>
            {known ? <RotateCcw aria-hidden className="size-4 text-ink-muted" /> : <BookCheck aria-hidden className="size-4 text-ink-muted" />}
            {known ? 'Учить снова' : 'Знаю — не учить'}
          </button>
          <button type="button" role="menuitem" tabIndex={-1} className={cx(item, 'text-danger hover:bg-danger-soft focus-visible:bg-danger-soft')} onClick={run(() => onDelete(word))}>
            <Trash2 aria-hidden className="size-4" /> Удалить
          </button>
        </div>
      )}
    </div>
  )
}
