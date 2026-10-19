import { Link } from 'react-router-dom'
import type { VocabWord } from '@/content'

const GENDER: Record<NonNullable<VocabWord['gender']>, { label: string; title: string; cls: string }> = {
  m: { label: 'м', title: 'мужской род (o)', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' },
  f: { label: 'ж', title: 'женский род (a)', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' },
  mf: { label: 'м/ж', title: 'оба рода (o/a)', cls: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200' },
}

export function GenderBadge({ gender }: { gender?: VocabWord['gender'] }) {
  if (!gender) return null
  const g = GENDER[gender]
  return (
    <span
      title={g.title}
      aria-label={g.title}
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-px text-[11px] font-semibold ${g.cls}`}
    >
      {g.label}
    </span>
  )
}

/** Small round "+" button that turns into "✓" once the card exists. */
export function AddCardButton({ added, disabled, onClick }: { added: boolean; disabled?: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={added || disabled}
      aria-label={added ? 'Уже в повторении' : 'Добавить в повторение'}
      title={added ? 'Уже в повторении' : 'Добавить в повторение'}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-base transition active:scale-95 disabled:cursor-default ${
        added
          ? 'border-brand-600/30 bg-brand-50 text-brand-700 dark:bg-brand-800/30 dark:text-brand-100'
          : 'border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800'
      }`}
    >
      {added ? '✓' : '+'}
    </button>
  )
}

export function BackLink({ to = '/library', label = 'Библиотека' }: { to?: string; label?: string }) {
  return (
    <Link to={to} className="inline-block text-sm no-underline print:hidden">
      ← {label}
    </Link>
  )
}

export function NotFound({ what }: { what: string }) {
  return (
    <div className="space-y-3">
      <BackLink />
      <h1>{what} не найден</h1>
      <p className="text-stone-500">Возможно, материал переименовали или ещё не добавили.</p>
    </div>
  )
}
