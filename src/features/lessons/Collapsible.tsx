import type { ReactNode } from 'react'

export function Collapsible({ title, icon, children, defaultOpen }: { title: string; icon?: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group card p-0" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-semibold select-none [&::-webkit-details-marker]:hidden">
        {icon && <span aria-hidden>{icon}</span>}
        <span className="flex-1">{title}</span>
        <span aria-hidden className="text-stone-400 transition group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t border-stone-200 px-4 py-3 dark:border-stone-800">{children}</div>
    </details>
  )
}
