import { useEffect, useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { getCheatsheet } from '@/content'
import { Printer } from 'lucide-react'
import { scrollBehavior } from '@/components/cx'
import { Markdown } from '@/components/Markdown'
import { parseCheatsheet } from './cheatsheets'
import { BackLink, NotFound } from './ui'
import './print.css'

const headingId = (i: number) => `cs-${i}`

export function CheatsheetPage() {
  const { id = '' } = useParams()
  const raw = getCheatsheet(id)
  const sheet = useMemo(() => (raw ? parseCheatsheet(raw) : undefined), [raw])
  const bodyRef = useRef<HTMLDivElement>(null)

  // The shared Markdown renderer doesn't emit heading ids: assign them in document order
  // (h2/h3 in the DOM correspond 1:1 to the parsed `#`/`##`/`###` headings).
  useEffect(() => {
    bodyRef.current?.querySelectorAll('h2, h3').forEach((h, i) => {
      h.id = headingId(i)
      h.classList.add('scroll-mt-20', 'md:scroll-mt-24')
    })
    // Deep link to a section (#cs-3): the ids exist only now, so scroll manually.
    const target = location.hash.slice(1)
    if (target) document.getElementById(target)?.scrollIntoView({ block: 'start' })
  }, [sheet])

  useEffect(() => {
    if (sheet) document.title = `${sheet.title} — Português PT`
    return () => {
      document.title = 'Português PT'
    }
  }, [sheet])

  if (!sheet) return <NotFound what="Лист" />

  const jump = (i: number) => {
    const el = document.getElementById(headingId(i))
    if (!el) return
    el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
    history.replaceState(history.state, '', `#${headingId(i)}`)
  }

  return (
    <article className="cheatsheet page">
      <div className="no-print flex items-center justify-between gap-3">
        <BackLink />
        <button type="button" className="btn-ghost btn-sm hidden md:inline-flex" onClick={() => window.print()}>
          <Printer aria-hidden className="size-4.5" /> Печать
        </button>
      </div>

      <header className="space-y-1">
        <h1>{sheet.title}</h1>
        <p className="no-print text-sm text-ink-muted">Шпаргалка</p>
      </header>

      {sheet.toc.length > 2 && (
        <nav aria-label="Содержание" className="no-print card py-3">
          <details open className="group">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-ink-muted select-none">
              Содержание
            </summary>
            <ol className="mt-1 flex flex-wrap gap-2 text-sm sm:block sm:columns-2 sm:gap-6 md:columns-3">
              {sheet.toc.map((t, i) => (
                <li key={i} className={`break-inside-avoid ${t.level === 3 ? 'sm:pl-4' : 'font-medium'}`}>
                  <a
                    href={`#${headingId(i)}`}
                    onClick={(e) => {
                      e.preventDefault()
                      jump(i)
                    }}
                    className="flex min-h-9 items-center rounded-pill bg-surface-2 px-3 no-underline transition-colors hover:bg-sunken/60 sm:block sm:min-h-0 sm:rounded-none sm:bg-transparent sm:px-0 sm:py-1.5 sm:hover:bg-transparent sm:hover:underline"
                  >
                    {t.text}
                  </a>
                </li>
              ))}
            </ol>
          </details>
        </nav>
      )}

      <div ref={bodyRef} className="card print:border-0 print:p-0">
        <Markdown>{sheet.body}</Markdown>
      </div>

      <div className="no-print">
        <BackLink />
      </div>
    </article>
  )
}
