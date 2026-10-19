import { Check, Plus, SearchX } from 'lucide-react'
import type { VocabWord } from '@/content'
import { cx } from '@/components/cx'
import { EmptyState } from '@/components/EmptyState'
import { BackLink as SharedBackLink } from '@/components/PageHeader'
import { practicePath } from '@/features/practice/paths'

/** Grammatical gender: neutral chip (no blue/pink coding), letter + article. */
const GENDER: Record<NonNullable<VocabWord['gender']>, { label: string; title: string }> = {
  m: { label: 'м · o', title: 'мужской род (o)' },
  f: { label: 'ж · a', title: 'женский род (a)' },
  mf: { label: 'м/ж', title: 'оба рода (o/a)' },
}

export function GenderBadge({ gender }: { gender?: VocabWord['gender'] }) {
  if (!gender) return null
  const g = GENDER[gender]
  return (
    <span
      title={g.title}
      className="inline-flex shrink-0 items-center rounded-pill bg-surface-2 px-2 py-px align-middle text-xs font-semibold text-ink-muted"
    >
      <span aria-hidden>{g.label}</span>
      <span className="sr-only">{g.title}</span>
    </span>
  )
}

/**
 * «+» action that turns into «✓» once the card (or dictionary word) exists.
 * `round` (default): 44px outlined circle. `text`: a quiet text action for dense lists — the hit area stays 44px.
 */
export function AddCardButton({
  added,
  disabled,
  onClick,
  variant = 'round',
  name,
  target = 'review',
}: {
  /** What is added (goes into the accessible name, so a list of «+» buttons stays distinguishable). */
  name?: string
  added: boolean
  disabled?: boolean
  onClick(): void
  variant?: 'round' | 'text'
  /** review = SRS cards (phrases), words = the personal dictionary. */
  target?: 'review' | 'words'
}) {
  const where = target === 'words' ? 'словарь' : 'повторение'
  const inWhere = target === 'words' ? 'в словаре' : 'в повторении'
  const label = name
    ? added
      ? `«${name}» уже ${inWhere}`
      : `Добавить «${name}» в ${where}`
    : added
      ? `Уже ${inWhere}`
      : `Добавить в ${where}`
  const icon = added ? <Check aria-hidden className={variant === 'text' ? 'size-4' : 'size-5'} strokeWidth={2.5} /> : <Plus aria-hidden className={variant === 'text' ? 'size-4' : 'size-5'} />
  if (variant === 'text') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={added || disabled}
        aria-label={label}
        title={label}
        className={cx(
          'inline-flex size-11 shrink-0 items-center justify-center rounded-control text-sm font-semibold transition-colors disabled:cursor-default',
          added ? 'text-brand-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
          disabled && !added && 'opacity-50',
        )}
      >
        {icon}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={added || disabled}
      aria-label={label}
      title={label}
      className={cx(
        'grid size-11 shrink-0 place-items-center rounded-full border transition-[background-color,border-color,transform] duration-150 active:scale-95 disabled:cursor-default',
        added
          ? 'border-transparent bg-brand-soft text-brand-ink'
          : 'border-[1.5px] border-ink text-ink hover:border-brand hover:bg-brand hover:text-on-brand',
        disabled && !added && 'opacity-50',
      )}
    >
      {icon}
    </button>
  )
}

export function BackLink({ to = practicePath('cheatsheets'), label = 'Практика · Шпаргалки' }: { to?: string; label?: string }) {
  return <SharedBackLink to={to} label={label} />
}

export function NotFound({ what, back }: { what: string; back?: { to: string; label: string } }) {
  return (
    <div className="space-y-3">
      <BackLink {...back} />
      <div className="card">
        <EmptyState
          icon={<SearchX className="size-7" />}
          tone="neutral"
          title={`${what} не найден`}
          text="Возможно, материал переименовали или ещё не добавили."
        />
      </div>
    </div>
  )
}
