import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listVocabThemes, type VocabTheme } from '@/content'
import { getLoadedLexicon, loadLexicon } from '@/engine/lexicon/lookup'
import { plural } from '@/features/library/format'
import { contentWordInput } from '@/features/words/lexicon'
import { useWords } from '@/features/words/useWords'
import { wordIdFor } from '@/features/words/wordOps'
import { groupByLevel, useLevelFilter } from './levels'
import { PracticeHeader } from './PracticeHeader'
import { vocabHref } from './paths'
import { EmptyFrame, GroupTitle, LevelChips } from './ui'

/** /practice/vocab — themed word lists (each with a quiz and «в словарь»), grouped by level. */
export function VocabIndexPage() {
  const themes = useMemo(() => listVocabThemes().sort((a, b) => a.title.localeCompare(b.title, 'ru')), [])
  const [filter, setFilter] = useLevelFilter()
  const groups = groupByLevel(themes, filter)
  const words = themes.reduce((n, t) => n + t.words.length, 0)
  const saved = useSavedPerTheme(themes)

  return (
    <div className="page">
      <PracticeHeader
        section="vocab"
        lead={
          <p>
            Тематические словари: слова с родом, примерами и озвучкой. Проверьте себя квизом и сохраните нужные слова в «Мой словарь».
            {themes.length > 0 && (
              <>
                {' '}
                {plural(themes.length, 'тема', 'темы', 'тем')}, {plural(words, 'слово', 'слова', 'слов')}.
              </>
            )}
          </p>
        }
      >
        {themes.length > 0 && <LevelChips items={themes} value={filter} onChange={setFilter} />}
      </PracticeHeader>

      {themes.length === 0 && <EmptyFrame>Тематических словарей пока нет — они появятся здесь, как только будут добавлены.</EmptyFrame>}
      {themes.length > 0 && groups.length === 0 && <p className="card text-sm text-ink-muted">На уровне {filter} словарей пока нет.</p>}

      {groups.map((g) => (
        <section key={g.level ?? 'none'} className="space-y-3">
          <GroupTitle title={g.level ?? 'Без уровня'} hint={plural(g.items.length, 'тема', 'темы', 'тем')} />
          <ul className="grid grid-cols-2 gap-(--gutter) sm:grid-cols-3 lg:grid-cols-4">
            {g.items.map((t) => (
              <li key={t.id}>
                <Link to={vocabHref(t.id)} className="card card-link flex h-full flex-col gap-3 p-4 no-underline lg:p-4">
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
                  <span className="mt-auto flex flex-wrap items-baseline justify-between gap-x-2 text-sm text-ink-muted">
                    <span>
                      <span className="font-display text-h2 leading-none text-ink tabular-nums">{t.words.length}</span>{' '}
                      {plural(t.words.length, 'слово', 'слова', 'слов').replace(/^\d+\s/, '')}
                    </span>
                    {saved && (
                      <span className={(saved.get(t.id) ?? 0) > 0 ? 'font-semibold text-ink tabular-nums' : 'tabular-nums'}>
                        в словаре {saved.get(t.id) ?? 0}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <WordsHint />
    </div>
  )
}

/**
 * Theme id → how many of its words are in «Мой словарь» (same matching as the theme page's «в словарь»). Null until
 * the dictionary is ready and the lexicon chunk is loaded — it is loaded only when the dictionary has words.
 */
function useSavedPerTheme(themes: readonly VocabTheme[]): Map<string, number> | null {
  const dict = useWords()
  const [lex, setLex] = useState(getLoadedLexicon)
  const any = dict.counts.total > 0
  useEffect(() => {
    if (lex || !any) return
    let alive = true
    loadLexicon().then(
      (l) => alive && setLex(l),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [lex, any])
  return useMemo(() => {
    if (!lex || dict.status !== 'ready' || !any) return null
    const out = new Map<string, number>()
    for (const t of themes) {
      const key = `vocab:${t.id}`
      let n = 0
      for (const w of t.words) if (dict.index.byId.has(wordIdFor(contentWordInput(lex, w, { themeKey: key, src: key })))) n++
      out.set(t.id, n)
    }
    return out
  }, [lex, dict.status, dict.index, any, themes])
}

/** Quiet pointer to the personal dictionary, where saved words live. */
function WordsHint() {
  const { counts } = useWords()
  return (
    <p className="text-sm text-ink-muted">
      Сохранённые слова — в разделе <Link to="/words">«Мой словарь»</Link>
      {counts.total > 0 && <> ({plural(counts.total, 'слово', 'слова', 'слов')})</>}.
    </p>
  )
}
