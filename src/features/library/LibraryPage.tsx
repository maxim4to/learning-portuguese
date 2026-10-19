import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Library, MessagesSquare } from 'lucide-react'
import { LEVELS, listReadingTexts, listVocabThemes } from '@/content'
import { cx } from '@/components/cx'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { useProgressMap } from '@/features/lessons/useTopicProgress'
import { listParsedCheatsheets } from './cheatsheets'
import { plural } from './format'

const levelRank = (l?: string) => (l ? LEVELS.indexOf(l as (typeof LEVELS)[number]) : LEVELS.length)

/** Sub-sections of «Практика»: situations (default) and the reference library — separate routes. */
export function MaterialsTabs({ active }: { active: 'library' | 'situations' }) {
  const tab = (on: boolean) =>
    cx(
      'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-pill px-5 text-sm font-semibold no-underline transition-[background-color,color] sm:flex-none',
      on ? 'bg-ink text-surface' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
    )
  return (
    <nav aria-label="Разделы практики" className="flex gap-1 rounded-pill bg-surface p-1 sm:inline-flex">
      <Link to="/situations" className={tab(active === 'situations')} aria-current={active === 'situations' ? 'page' : undefined}>
        <MessagesSquare aria-hidden className="size-4" /> Ситуации
      </Link>
      <Link to="/library" className={tab(active === 'library')} aria-current={active === 'library' ? 'page' : undefined}>
        <Library aria-hidden className="size-4" /> Библиотека
      </Link>
    </nav>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h2 className="flex-1">{title}</h2>
        {hint && <span className="text-sm text-ink-muted">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line-strong">
      <EmptyState compact tone="neutral" title={children} />
    </div>
  )
}

const chevron = <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />

export function LibraryPage() {
  const sheets = listParsedCheatsheets()
  const themes = listVocabThemes().sort(
    (a, b) => levelRank(a.level) - levelRank(b.level) || a.title.localeCompare(b.title, 'ru'),
  )
  const texts = listReadingTexts().sort(
    (a, b) => levelRank(a.level) - levelRank(b.level) || a.title.localeCompare(b.title, 'pt'),
  )
  const { map: progress } = useProgressMap()

  return (
    <div className="page">
      <div className="space-y-4">
        <MaterialsTabs active="library" />
        <PageHeader title="Библиотека" subtitle="Шпаргалки для быстрой справки, тематические словари и тексты для чтения." />
      </div>

      <Section title="Шпаргалки" hint={sheets.length ? plural(sheets.length, 'лист', 'листа', 'листов') : undefined}>
        {sheets.length === 0 ? (
          <Empty>Шпаргалок пока нет.</Empty>
        ) : (
          <ul className="card divide-y divide-line p-0">
            {sheets.map((s) => (
              <li key={s.id} className="first:[&>a]:rounded-t-card last:[&>a]:rounded-b-card">
                <Link
                  to={`/library/cheatsheet/${s.id}`}
                  className="group flex min-h-16 items-center gap-3 px-4 py-3 no-underline transition-colors hover:bg-surface-2 sm:px-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block leading-tight font-semibold text-ink">{s.title}</span>
                    {s.intro && <span className="mt-0.5 line-clamp-1 text-sm text-ink-muted">{s.intro}</span>}
                  </span>
                  {chevron}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Словари" hint={themes.length ? plural(themes.length, 'тема', 'темы', 'тем') : undefined}>
        {themes.length === 0 ? (
          <Empty>Тематических словарей пока нет — они появятся здесь, как только будут добавлены.</Empty>
        ) : (
          <ul className="grid grid-cols-2 gap-(--gutter) sm:grid-cols-3 lg:grid-cols-4">
            {themes.map((t) => (
              <li key={t.id}>
                <Link to={`/library/vocab/${t.id}`} className="card card-link flex h-full flex-col gap-3 p-4 no-underline lg:p-4">
                  <span className="min-w-0">
                    <span className="block leading-tight font-semibold text-ink hyphens-auto" lang="ru">
                      {t.title}
                    </span>
                    {t.titlePt && (
                      <span lang="pt-PT" className="mt-0.5 block font-pt text-sm text-ink-muted italic hyphens-auto">
                        {t.titlePt}
                      </span>
                    )}
                  </span>
                  <span className="mt-auto flex items-baseline justify-between gap-2 text-sm text-ink-muted">
                    <span>
                      <span className="font-display text-h2 leading-none text-ink tabular-nums">{t.words.length}</span>{' '}
                      {plural(t.words.length, 'слово', 'слова', 'слов').replace(/^\d+\s/, '')}
                    </span>
                    {t.level && <span className="text-xs font-semibold tracking-wide">{t.level}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Чтение" hint={texts.length ? plural(texts.length, 'текст', 'текста', 'текстов') : undefined}>
        {texts.length === 0 ? (
          <Empty>Текстов для чтения пока нет — они появятся здесь, как только будут добавлены.</Empty>
        ) : (
          <ul className="border-t border-line">
            {texts.map((r) => {
              const p = progress.get(r.id)
              return (
                <li key={r.id} className="border-b border-line">
                  <Link
                    to={`/library/reading/${r.id}`}
                    className="group flex min-h-16 items-center gap-4 rounded-control px-1 py-3 no-underline transition-colors hover:bg-surface"
                  >
                    <span className="w-8 shrink-0 text-sm font-bold tracking-wide text-ink-muted tabular-nums">{r.level}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-h2 text-ink" lang="pt-PT">
                        {r.title}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
                        {plural(r.paragraphs.length, 'абзац', 'абзаца', 'абзацев')}
                        {r.questions.length > 0 && <> · {plural(r.questions.length, 'вопрос', 'вопроса', 'вопросов')}</>}
                        {p && <StatusBadge status={p.status} />}
                      </span>
                    </span>
                    {chevron}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}
