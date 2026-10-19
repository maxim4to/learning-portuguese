import { GraduationCap, House, MapPinOff } from 'lucide-react'
import { ButtonLink } from '@/components/Button'
import { AzulejoCorner } from '@/components/Card'

export function NotFoundPage() {
  return (
    <section className="card-raised relative isolate mx-auto max-w-lg overflow-hidden rounded-hero px-6 py-10 text-center">
      <AzulejoCorner />
      <span aria-hidden className="mx-auto grid size-16 place-items-center rounded-full bg-azulejo-soft text-azulejo">
        <MapPinOff className="size-8" />
      </span>
      <p className="mt-4 font-pt text-lg text-ink-muted" lang="pt-PT">
        Perdido?
      </p>
      <h1 className="mt-1">Такой страницы нет</h1>
      <p className="mx-auto mt-2 max-w-[36ch] text-ink-muted">Возможно, ссылка устарела. Вернитесь на главную или к курсу.</p>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        <ButtonLink to="/" icon={<House className="size-5" />}>
          На главную
        </ButtonLink>
        <ButtonLink to="/syllabus" variant="secondary" icon={<GraduationCap className="size-5" />}>
          К курсу
        </ButtonLink>
      </div>
    </section>
  )
}
