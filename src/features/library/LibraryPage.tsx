import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BookA, BookOpenText, ChevronRight, FileText, Library, MessagesSquare, type LucideIcon } from 'lucide-react'
import { LEVELS, listReadingTexts, listVocabThemes } from '@/content'
import { cx } from '@/components/cx'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge, LevelBadge } from '@/components/StatusBadge'
import { useProgressMap } from '@/features/lessons/useTopicProgress'
import { listParsedCheatsheets } from './cheatsheets'
import { plural } from './format'

const levelRank = (l?: string) => (l ? LEVELS.indexOf(l as (typeof LEVELS)[number]) : LEVELS.length)

/** Sub-sections of «Практика»: situations (default) and the reference library — separate routes. */
export function MaterialsTabs({ active }: { active: 'library' | 'situations' }) {
  const tab = (on: boolean) =>
    cx(
      'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[calc(var(--radius-sm)-4px)] px-4 text-sm font-semibold no-underline transition-[background-color,color,box-shadow] sm:flex-none',
      on ? 'bg-surface text-ink shadow-card ring-1 ring-line' : 'text-ink-muted hover:text-ink',
    )
  return (
    <nav aria-label="Разделы практики" className="flex gap-1 rounded-control bg-surface-2 p-1 sm:inline-flex">
      <Link to="/situations" className={tab(active === 'situations')} aria-current={active === 'situations' ? 'page' : undefined}>
        <MessagesSquare aria-hidden className="size-4" /> Ситуации
      </Link>
      <Link to="/library" className={tab(active === 'library')} aria-current={active === 'library' ? 'page' : undefined}>
        <Library aria-hidden className="size-4" /> Библиотека
      </Link>
    </nav>
  )
}

function Section({ title, hint, icon: Icon, tone, children }: { title: string; hint?: string; icon: LucideIcon; tone: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <span aria-hidden className={cx('grid size-9 place-items-center rounded-xl', tone)}>
          <Icon className="size-5" />
        </span>
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

const cardLink = 'card card-link group flex h-full items-start gap-3'
const chevron = <ChevronRight aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />

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
    <div className="space-y-8">
      <div className="space-y-4">
        <MaterialsTabs active="library" />
        <PageHeader title="Библиотека" subtitle="Шпаргалки для быстрой справки, тематические словари и тексты для чтения." />
      </div>

      <Section title="Шпаргалки" icon={FileText} tone="bg-azulejo-soft text-azulejo" hint={sheets.length ? plural(sheets.length, 'лист', 'листа', 'листов') : undefined}>
        {sheets.length === 0 ? (
          <Empty>Шпаргалок пока нет.</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {sheets.map((s) => (
              <li key={s.id}>
                <Link to={`/library/cheatsheet/${s.id}`} className={cardLink}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{s.title}</span>
                    {s.intro && <span className="mt-1 line-clamp-2 text-sm text-ink-muted">{s.intro}</span>}
                  </span>
                  {chevron}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Словари" icon={BookA} tone="bg-sun-soft text-sun" hint={themes.length ? plural(themes.length, 'тема', 'темы', 'тем') : undefined}>
        {themes.length === 0 ? (
          <Empty>Тематических словарей пока нет — они появятся здесь, как только будут добавлены.</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {themes.map((t) => (
              <li key={t.id}>
                <Link to={`/library/vocab/${t.id}`} className={cardLink}>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-semibold">
                      {t.level && <LevelBadge level={t.level} />}
                      {t.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-muted">
                      {t.titlePt && (
                        <i lang="pt-PT" className="font-serif">
                          {t.titlePt}
                          {' · '}
                        </i>
                      )}
                      {plural(t.words.length, 'слово', 'слова', 'слов')}
                    </span>
                  </span>
                  {chevron}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Чтение" icon={BookOpenText} tone="bg-terracotta-soft text-terracotta" hint={texts.length ? plural(texts.length, 'текст', 'текста', 'текстов') : undefined}>
        {texts.length === 0 ? (
          <Empty>Текстов для чтения пока нет — они появятся здесь, как только будут добавлены.</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {texts.map((r) => {
              const p = progress.get(r.id)
              return (
                <li key={r.id}>
                  <Link to={`/library/reading/${r.id}`} className={cardLink}>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <LevelBadge level={r.level} />
                        <span className="font-serif text-lg leading-snug font-semibold" lang="pt-PT">
                          {r.title}
                        </span>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
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
