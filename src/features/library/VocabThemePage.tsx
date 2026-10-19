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
        eyebrow={
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

      <div className="card overflow-hidden p-0">
        <table className="w-full table-fixed border-collapse text-left break-words">
          <thead className="bg-surface-2 text-sm text-ink-muted">
            <tr>
              <th className="w-[50%] px-2 py-2.5 font-semibold sm:px-3 md:w-[32%]">Português</th>
              <th className="px-2 py-2.5 font-semibold sm:px-3">Перевод</th>
              <th className="hidden w-[34%] px-3 py-2.5 font-semibold md:table-cell">Пример</th>
              <th className="w-14 px-1.5 py-2 sm:w-16 sm:px-2">
                <span className="sr-only">В повторение</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {theme.words.map((w, i) => {
              const spec = specs[i]
              return (
                <tr key={i} className="border-t border-line align-top">
                  <td className="px-2 py-2 sm:px-3">
                    <div className="flex items-start gap-2">
                      <SpeakButton text={w.pt} size="sm" />
                      <div className="min-w-0 pt-2">
                        <span className="font-semibold" lang="pt-PT">
                          {w.pt}
                        </span>{' '}
                        <GenderBadge gender={w.gender} />
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 pt-4 sm:px-3">
                    {w.ru}
                    {w.example && (
                      <p className="mt-1 font-pt text-sm text-ink-muted md:hidden" lang="pt-PT">
                        {w.example}
                      </p>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 pt-4 font-pt text-sm text-ink-muted md:table-cell" lang="pt-PT">
                    {w.example}
                  </td>
                  <td className="px-1.5 py-2 sm:px-2">
                    <AddCardButton
                      added={!!cards.have?.has(spec.id)}
                      disabled={cards.busy || cards.have === null}
                      onClick={() => void cards.add([spec])}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <VocabTutor theme={theme} />
    </article>
  )
}
