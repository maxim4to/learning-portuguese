import { Link } from 'react-router-dom'
import { ChevronRight, GraduationCap, House } from 'lucide-react'
import { ButtonLink } from '@/components/Button'
import { Illustration } from '@/components/Illustration'
import { NAV_ITEMS } from './nav'

/** 404: the message beside the app's sections (same container and grid as every route). */
export function NotFoundPage() {
  return (
    <div className="page">
      <header>
        <h1>Такой страницы нет</h1>
      </header>
      <div className="page-grid">
        <section className="card-raised grid items-center gap-6 md:grid-cols-[15rem_minmax(0,1fr)]">
          <Illustration name="not-found" eager sizes="240px" className="w-60 max-w-full rounded-card" />
          <div className="space-y-4">
            <p className="measure text-ink-muted"><span lang="pt-PT" className="font-pt">Perdido?</span> Возможно, ссылка устарела или в адресе опечатка. Вернитесь на главную или к курсу.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <ButtonLink to="/" icon={<House />}>
                На главную
              </ButtonLink>
              <ButtonLink to="/syllabus" variant="secondary" icon={<GraduationCap />}>
                К курсу
              </ButtonLink>
            </div>
          </div>
        </section>
        <nav aria-labelledby="nf-sections" className="card space-y-2">
          <h2 id="nf-sections">Разделы</h2>
          <ul className="divide-y divide-line">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="flex min-h-11 items-center justify-between gap-3 font-semibold text-ink no-underline hover:underline">
                  {item.label}
                  <ChevronRight aria-hidden className="size-4 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  )
}
