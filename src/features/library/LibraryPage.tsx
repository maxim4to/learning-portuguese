import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LEVELS, listReadingTexts, listVocabThemes } from '@/content'
import { StatusBadge, LevelBadge } from '@/components/StatusBadge'
import { useProgressMap } from '@/features/lessons/useTopicProgress'
import { listParsedCheatsheets } from './cheatsheets'
import { plural } from './format'

const levelRank = (l?: string) => (l ? LEVELS.indexOf(l as (typeof LEVELS)[number]) : LEVELS.length)

/** Sub-tabs of the «Материалы» nav entry (situations live on their own route). */
export function MaterialsTabs({ active }: { active: 'library' | 'situations' }) {
  const tab = (on: boolean) =>
    `flex-1 rounded-lg px-3 py-1.5 text-center text-sm font-medium no-underline transition sm:flex-none ${
      on
        ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-stone-100'
        : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
    }`
  return (
    <nav aria-label="Материалы" className="flex gap-1 rounded-xl bg-stone-200/70 p-1 sm:inline-flex dark:bg-stone-900">
      <Link to="/library" className={tab(active === 'library')} aria-current={active === 'library' ? 'page' : undefined}>
        Библиотека
      </Link>
      <Link
        to="/situations"
        className={tab(active === 'situations')}
        aria-current={active === 'situations' ? 'page' : undefined}
      >
        Ситуации
      </Link>
    </nav>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2>{title}</h2>
        {hint && <span className="text-sm text-stone-500">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-stone-300 p-4 text-sm text-stone-500 dark:border-stone-700">
      {children}
    </p>
  )
}

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
      <div className="space-y-3">
        <MaterialsTabs active="library" />
        <h1>Библиотека</h1>
        <p className="text-stone-600 dark:text-stone-400">Шпаргалки для быстрой справки, тематические словари и тексты для чтения.</p>
      </div>

      <Section title="Шпаргалки" hint={sheets.length ? plural(sheets.length, 'лист', 'листа', 'листов') : undefined}>
        {sheets.length === 0 ? (
          <Empty>Шпаргалок пока нет.</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {sheets.map((s) => (
              <li key={s.id}>
                <Link to={`/library/cheatsheet/${s.id}`} className="card block h-full no-underline hover:border-brand-500/50">
                  <span className="font-semibold text-stone-900 dark:text-stone-100">{s.title}</span>
                  {s.intro && <span className="mt-1 line-clamp-2 text-sm text-stone-500">{s.intro}</span>}
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
          <ul className="grid gap-3 sm:grid-cols-2">
            {themes.map((t) => (
              <li key={t.id}>
                <Link to={`/library/vocab/${t.id}`} className="card flex h-full items-start gap-3 no-underline hover:border-brand-500/50">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-stone-900 dark:text-stone-100">{t.title}</span>
                    <span className="block text-sm text-stone-500">
                      {t.titlePt && (
                        <i lang="pt-PT">
                          {t.titlePt}
                          {' · '}
                        </i>
                      )}
                      {plural(t.words.length, 'слово', 'слова', 'слов')}
                    </span>
                  </span>
                  {t.level && <LevelBadge level={t.level} />}
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
          <ul className="grid gap-3 sm:grid-cols-2">
            {texts.map((r) => {
              const p = progress.get(r.id)
              return (
                <li key={r.id}>
                  <Link to={`/library/reading/${r.id}`} className="card flex h-full items-start gap-3 no-underline hover:border-brand-500/50">
                    <LevelBadge level={r.level} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-stone-900 dark:text-stone-100" lang="pt-PT">
                        {r.title}
                      </span>
                      <span className="block text-sm text-stone-500">
                        {plural(r.paragraphs.length, 'абзац', 'абзаца', 'абзацев')}
                        {r.questions.length > 0 && <> · {plural(r.questions.length, 'вопрос', 'вопроса', 'вопросов')}</>}
                      </span>
                    </span>
                    {p && <StatusBadge status={p.status} />}
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
