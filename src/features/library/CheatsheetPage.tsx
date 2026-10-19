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
    <article className="cheatsheet space-y-5">
      <div className="no-print flex items-center justify-between gap-3">
        <BackLink />
        <button type="button" className="btn-ghost hidden px-3 text-sm md:inline-flex" onClick={() => window.print()}>
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
            <ol className="mt-1 columns-1 gap-6 text-[0.9375rem] sm:columns-2">
              {sheet.toc.map((t, i) => (
                <li key={i} className={`break-inside-avoid ${t.level === 3 ? 'pl-4 text-sm' : 'font-medium'}`}>
                  <a
                    href={`#${headingId(i)}`}
                    onClick={(e) => {
                      e.preventDefault()
                      jump(i)
                    }}
                    className="block py-1.5 no-underline hover:underline"
                  >
                    {t.text}
                  </a>
                </li>
              ))}
            </ol>
          </details>
        </nav>
      )}

      <div ref={bodyRef} className="card sm:p-7 print:border-0 print:p-0">
        <Markdown>{sheet.body}</Markdown>
      </div>

      <div className="no-print">
        <BackLink />
      </div>
    </article>
  )
}
