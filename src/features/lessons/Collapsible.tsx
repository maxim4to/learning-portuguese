import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export function Collapsible({
  title,
  icon,
  children,
  defaultOpen,
}: {
  title: string
  icon?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details className="group card p-0" open={defaultOpen}>
      <summary className="flex min-h-13 cursor-pointer list-none items-center gap-3 rounded-card px-4 py-3 font-semibold select-none hover:bg-surface-2/60 [&::-webkit-details-marker]:hidden">
        {icon && (
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-muted">
            {icon}
          </span>
        )}
        <span className="flex-1">{title}</span>
        <ChevronDown aria-hidden className="size-5 text-ink-muted transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-4 py-4 sm:px-6">{children}</div>
    </details>
  )
}
