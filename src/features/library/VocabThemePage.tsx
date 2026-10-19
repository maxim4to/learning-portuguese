import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getVocabTheme } from '@/content'
import { Check, GraduationCap, Plus, Sparkles, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { SpeakButton } from '@/components/SpeakButton'
import { LevelBadge } from '@/components/StatusBadge'
import { VocabTutor } from '@/features/tutor/panels'
import { Pt } from '@/features/words/Pt'
import { useContentWords } from '@/features/words/useContentWords'
import { VocabQuiz } from './VocabQuiz'
import { AddCardButton, GenderBadge, NotFound } from './ui'
import { plural } from './format'

const NO_WORDS: never[] = []

export function VocabThemePage() {
  const { id = '' } = useParams()
  const theme = getVocabTheme(id)
  // Theme words go to «Мой словарь» (source vocab:<themeId>); cards are created by the dictionary.
  const dict = useContentWords(theme?.words ?? NO_WORDS, {
    themeKey: `vocab:${theme?.id ?? ''}`,
    src: `vocab:${theme?.id ?? ''}`,
    level: theme?.level,
  })
  const [quiz, setQuiz] = useState(false)

  if (!theme) return <NotFound what="Словарь" />

  const allAdded = dict.ready && dict.missing.length === 0

  return (
    <article className="page">
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
            <p className="font-pt text-base" lang="pt-PT">
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
          disabled={dict.busy || !dict.ready || allAdded}
          onClick={() => void dict.add(dict.missing)}
        >
          {allAdded ? <Check aria-hidden className="size-5 text-brand" /> : <Plus aria-hidden className="size-5" />}
          {allAdded
            ? 'Все слова в словаре'
            : `Добавить все в словарь${dict.ready && dict.missing.length < theme.words.length ? ` (${dict.missing.length})` : ''}`}
        </button>
        <a href="#tutor" className="inline-flex min-h-11 items-center justify-center gap-1.5 text-sm font-semibold sm:ml-1">
          <Sparkles aria-hidden className="size-4 text-terracotta" /> Практика с агентом
        </a>
        {allAdded && (
          <Link to="/words" className="inline-flex min-h-11 items-center text-sm font-semibold sm:ml-1">
            Открыть «Мой словарь»
          </Link>
        )}
      </div>

      {quiz && (
        <VocabQuiz
          items={theme.words.map((w, i) => ({ key: String(i), pt: w.pt, ru: w.ru, gender: w.gender, example: w.example }))}
          source={{ kind: 'vocab', id: theme.id }}
          onUnknown={(i) => void dict.add([i], { quiet: true })}
          onClose={() => setQuiz(false)}
        />
      )}

      {/* Word list. Phone: word + translation on line 1, example muted on line 2, «+» on the right.
          ≥md: four aligned columns (word · translation · example · action) with a quiet header. */}
      <section aria-label="Слова темы" className="card p-0">
        <div
          aria-hidden
          className="hidden grid-cols-[2.25rem_minmax(0,13fr)_minmax(0,11fr)_minmax(0,16fr)_auto] gap-x-4 border-b border-line-strong px-4 pt-3 pb-2 text-sm font-semibold text-ink-muted md:grid"
        >
          <span />
          <span>Português</span>
          <span>Перевод</span>
          <span>Пример</span>
          <span className="w-11" />
        </div>
        <ul>
          {theme.words.map((w, i) => {
            return (
              <li
                key={i}
                id={`w-${i}`}
                className="grid scroll-mt-28 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 border-b border-line px-2 py-2 last:border-b-0 sm:px-3 md:grid-cols-[auto_minmax(0,13fr)_minmax(0,11fr)_minmax(0,16fr)_auto] md:gap-x-4 md:px-4"
              >
                <SpeakButton text={w.pt} size="sm" />
                {/* Phone: one flowing line «word (gender) — translation», example below. md: contents split into columns. */}
                <div className="min-w-0 pt-2 md:contents">
                  <p className="min-w-0 md:pt-2">
                    <Pt src={{ kind: 'vocab', id: theme.id, part: 'examples', index: i }} ru={w.ru} className="font-semibold hyphens-auto">
                      {w.pt}
                    </Pt>{' '}
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
                    <Pt
                      as="p"
                      src={{ kind: 'vocab', id: theme.id, part: 'examples', index: i }}
                      className="mt-0.5 min-w-0 font-pt text-sm text-ink-muted hyphens-auto md:mt-0 md:pt-2.5"
                    >
                      {w.example}
                    </Pt>
                  ) : (
                    <span className="hidden md:block" />
                  )}
                </div>
                <AddCardButton
                  variant="text"
                  target="words"
                  name={w.pt}
                  added={!!dict.saved?.[i]}
                  disabled={dict.busy || !dict.ready}
                  onClick={() => void dict.add([i])}
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
