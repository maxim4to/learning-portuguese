import { Link } from 'react-router-dom'
import { listParsedCheatsheets } from '@/features/library/cheatsheets'
import { plural } from '@/features/library/format'
import { PracticeHeader } from './PracticeHeader'
import { cheatsheetHref } from './paths'
import { EmptyFrame, RowChevron } from './ui'

/** /practice/cheatsheets — one-page grammar references (printable). */
export function CheatsheetsPage() {
  const sheets = listParsedCheatsheets()
  return (
    <div className="page">
      <PracticeHeader
        section="cheatsheets"
        lead="Грамматика на одной странице: таблицы времён, неправильные глаголы, местоимения, предлоги. Открывайте, когда нужно быстро свериться, или распечатайте."
      />
      {sheets.length === 0 ? (
        <EmptyFrame>Шпаргалок пока нет.</EmptyFrame>
      ) : (
        <ul className="grid gap-(--gutter) sm:grid-cols-2 lg:grid-cols-3">
          {sheets.map((s) => {
            const sections = s.toc.filter((t) => t.level === 2).length
            return (
              <li key={s.id}>
                <Link to={cheatsheetHref(s.id)} className="card card-link group flex h-full flex-col gap-3 no-underline">
                  <span className="flex items-start gap-3">
                    <span className="min-w-0 flex-1 text-base leading-tight font-semibold text-ink">{s.title}</span>
                    <RowChevron />
                  </span>
                  {s.intro && <span className="line-clamp-3 text-sm text-ink-muted">{s.intro}</span>}
                  {sections > 0 && (
                    <span className="mt-auto text-xs font-semibold text-ink-muted">{plural(sections, 'раздел', 'раздела', 'разделов')}</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
