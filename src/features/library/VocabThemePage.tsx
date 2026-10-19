import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getVocabTheme } from '@/content'
import { Check, GraduationCap, Plus, Sparkles, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { SpeakButton } from '@/components/SpeakButton'
import { LevelBadge } from '@/components/StatusBadge'
import { VocabTutor } from '@/features/tutor/panels'
import { useLibraryCards, vocabCardSpecs } from './cards'
import { VocabQuiz } from './VocabQuiz'
import { AddCardButton, GenderBadge, NotFound } from './ui'
import { plural } from './format'

export function VocabThemePage() {
  const { id = '' } = useParams()
  const theme = getVocabTheme(id)
  const specs = useMemo(() => (theme ? vocabCardSpecs(theme) : []), [theme])
  const cards = useLibraryCards(theme?.id ?? '', specs)
  const [quiz, setQuiz] = useState(false)

  if (!theme) return <NotFound what="Словарь" />

  const missing = cards.have ? specs.filter((s) => !cards.have!.has(s.id)) : specs
  const allAdded = cards.have !== null && missing.length === 0

  return (
    <article className="space-y-5">
      <PageHeader
        back={{ to: '/library', label: 'Библиотека' }}
        meta={
          <>
            {theme.level && <LevelBadge level={theme.level} />}
            <span>Словарь · {plural(theme.words.length, 'слово', 'слова', 'слов')}</span>
          </>
        }
        title={theme.title}
        subtitle={
          theme.titlePt && (
            <p className="font-pt text-lg" lang="pt-PT">
              {theme.titlePt}
            </p>
          )
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button type="button" className={quiz ? 'btn-secondary' : 'btn-primary'} onClick={() => setQuiz((q) => !q)}>
          {quiz ? <X aria-hidden className="size-5" /> : <GraduationCap aria-hidden className="size-5" />}
          {quiz ? 'Закрыть самопроверку' : 'Проверить себя'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={cards.busy || cards.have === null || allAdded}
          onClick={() => void cards.add(missing)}
        >
          {allAdded ? <Check aria-hidden className="size-5 text-brand" /> : <Plus aria-hidden className="size-5" />}
          {allAdded ? 'Все слова в повторении' : `Добавить все в повторение${cards.have && missing.length < specs.length ? ` (${missing.length})` : ''}`}
        </button>
        <a href="#tutor" className="inline-flex min-h-11 items-center justify-center gap-1.5 text-sm font-semibold sm:ml-1">
          <Sparkles aria-hidden className="size-4 text-terracotta" /> Практика с агентом
        </a>
        {cards.msg && (
          <span className="text-sm text-ink-muted" role="status">
            {cards.msg}
          </span>
        )}
      </div>

      {quiz && (
        <VocabQuiz
          theme={theme}
          onUnknown={(i) => void cards.add([specs[i]], { quiet: true })}
          onClose={() => setQuiz(false)}
        />
      )}

      {/* Word list. Phone: word + translation on line 1, example muted on line 2, «+» on the right.
          ≥md: four aligned columns (word · translation · example · action) with a quiet header. */}
      <section aria-label="Слова темы" className="card p-0">
        <div
          aria-hidden
          className="hidden grid-cols-[2.5rem_minmax(0,13fr)_minmax(0,11fr)_minmax(0,16fr)_auto] gap-x-4 border-b border-line-strong px-4 pt-3 pb-2 text-[0.8125rem] font-semibold text-ink-muted md:grid"
        >
          <span />
          <span>Português</span>
          <span>Перевод</span>
          <span>Пример</span>
          <span className="w-11" />
        </div>
        <ul>
          {theme.words.map((w, i) => {
            const spec = specs[i]
            return (
              <li
                key={i}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 border-b border-line px-2 py-2 last:border-b-0 sm:px-3 md:grid-cols-[auto_minmax(0,13fr)_minmax(0,11fr)_minmax(0,16fr)_auto] md:gap-x-4 md:px-4"
              >
                <SpeakButton text={w.pt} size="sm" />
                {/* Phone: one flowing line «word (gender) — translation», example below. md: contents split into columns. */}
                <div className="min-w-0 pt-2 md:contents">
                  <p className="min-w-0 md:pt-2">
                    <span className="font-semibold hyphens-auto" lang="pt-PT">
                      {w.pt}
                    </span>{' '}
                    <GenderBadge gender={w.gender} />
                    <span aria-hidden className="text-ink-subtle md:hidden">
                      {' — '}
                    </span>
                    <span className="hyphens-auto md:hidden" lang="ru">
                      {w.ru}
                    </span>
                  </p>
                  <p className="hidden min-w-0 pt-2 hyphens-auto md:block" lang="ru">
                    {w.ru}
                  </p>
                  {w.example ? (
                    <p className="mt-0.5 min-w-0 font-pt text-sm text-ink-muted hyphens-auto md:mt-0 md:pt-2.5" lang="pt-PT">
                      {w.example}
                    </p>
                  ) : (
                    <span className="hidden md:block" />
                  )}
                </div>
                <AddCardButton
                  variant="text"
                  added={!!cards.have?.has(spec.id)}
                  disabled={cards.busy || cards.have === null}
                  onClick={() => void cards.add([spec])}
                />
              </li>
            )
          })}
        </ul>
      </section>

      <VocabTutor theme={theme} />
    </article>
  )
}
