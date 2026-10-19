import { Link } from 'react-router-dom'
import { listReadingTexts } from '@/content'
import { StatusBadge } from '@/components/StatusBadge'
import { plural } from '@/features/library/format'
import { useProgressMap } from '@/features/lessons/useTopicProgress'
import { groupByLevel, useLevelFilter } from './levels'
import { PracticeHeader } from './PracticeHeader'
import { readingHref } from './paths'
import { EmptyFrame, GroupTitle, LevelChips, RowChevron } from './ui'

/** /practice/reading — graded texts with a glossary and comprehension questions, grouped by level. */
export function ReadingIndexPage() {
  const texts = listReadingTexts().sort((a, b) => a.title.localeCompare(b.title, 'pt'))
  const [filter, setFilter] = useLevelFilter()
  const groups = groupByLevel(texts, filter)
  const { map: progress } = useProgressMap()
  const done = texts.filter((t) => progress.get(t.id)?.status === 'confident').length

  return (
    <div className="page">
      <PracticeHeader
        section="reading"
        lead={
          <p>
            Короткие тексты о жизни в Португалии по уровням: слушайте, читайте с глоссарием и отвечайте на вопросы.
            {texts.length > 0 && (
              <>
                {' '}
                {plural(texts.length, 'текст', 'текста', 'текстов')}
                {done > 0 && <>, уверенно {done}</>}.
              </>
            )}
          </p>
        }
      >
        {texts.length > 0 && <LevelChips items={texts} value={filter} onChange={setFilter} />}
      </PracticeHeader>

      {texts.length === 0 && <EmptyFrame>Текстов для чтения пока нет — они появятся здесь, как только будут добавлены.</EmptyFrame>}
      {texts.length > 0 && groups.length === 0 && <p className="card text-sm text-ink-muted">На уровне {filter} текстов пока нет.</p>}

      {groups.map((g) => (
        <section key={g.level ?? 'none'} className="space-y-3">
          <GroupTitle title={g.level ?? 'Без уровня'} hint={plural(g.items.length, 'текст', 'текста', 'текстов')} />
          {/* Two balanced columns from lg, like the situations list. */}
          <ul className="card overflow-hidden p-0 lg:columns-2 lg:gap-0 lg:[column-rule:1px_solid_var(--border)]">
            {g.items.map((r) => {
              const p = progress.get(r.id)
              return (
                <li key={r.id} className="break-inside-avoid border-b border-line last:border-b-0">
                  <Link
                    to={readingHref(r.id)}
                    className="group flex min-h-[4.5rem] items-center gap-3 px-4 py-3 no-underline transition-colors duration-150 hover:bg-surface-2 sm:gap-4"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block leading-tight font-semibold text-ink" lang="pt-PT">
                        {r.title}
                      </span>
                      <span className="mt-0.5 block text-sm text-ink-muted">
                        {plural(r.paragraphs.length, 'абзац', 'абзаца', 'абзацев')}
                        {r.glossary.length > 0 && <span className="max-sm:hidden"> · {plural(r.glossary.length, 'слово', 'слова', 'слов')} в глоссарии</span>}
                        {r.questions.length > 0 && <> · {plural(r.questions.length, 'вопрос', 'вопроса', 'вопросов')}</>}
                      </span>
                    </span>
                    {p && p.status !== 'not-started' && <StatusBadge status={p.status} />}
                    <RowChevron />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
