import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Markdown renderer for theory / pt-vs-br / common-errors blocks.
 * GFM enabled (tables, ~~strike~~). Typography is styled by hand with Tailwind;
 * wide tables scroll horizontally inside their own container (no page overflow on mobile).
 */
const components: Components = {
  h1: ({ children }) => <h2 className="mt-6 mb-2 first:mt-0">{children}</h2>,
  h2: ({ children }) => <h2 className="mt-6 mb-2 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-5 mb-2 first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-4 mb-1 font-semibold first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-6 marker:text-stone-400">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-6 marker:text-stone-400">{children}</ol>,
  li: ({ children }) => <li className="pl-1 [&>ol]:my-1.5 [&>ul]:my-1.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-stone-950 dark:text-white">{children}</strong>,
  em: ({ children }) => <em className="text-brand-800 italic dark:text-brand-100">{children}</em>,
  del: ({ children }) => (
    <del className="text-red-700 decoration-red-500/70 decoration-2 dark:text-red-400">{children}</del>
  ),
  a: ({ href, children }) => (
    <a href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="underline">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-brand-500 bg-brand-50/60 py-1 pr-3 pl-4 text-stone-700 dark:bg-brand-800/20 dark:text-stone-300">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-stone-200 dark:border-stone-800" />,
  code: ({ children, className }) => {
    // Fenced blocks get a language-* class; inline code doesn't.
    if (className) return <code className={className}>{children}</code>
    return (
      <code className="rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[0.9em] text-stone-800 dark:bg-stone-800 dark:text-stone-100">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-xl bg-stone-100 p-3 font-mono text-sm leading-relaxed dark:bg-stone-800">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-4 -mx-1 overflow-x-auto overscroll-x-contain rounded-xl border border-stone-200 dark:border-stone-800">
      <table className="w-full border-collapse text-left text-[15px] leading-snug">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-stone-100 dark:bg-stone-800/70">{children}</thead>,
  tr: ({ children }) => (
    <tr className="border-b border-stone-200 last:border-b-0 even:bg-stone-50 dark:border-stone-800 dark:even:bg-stone-900/60">
      {children}
    </tr>
  ),
  th: ({ children, style }) => (
    <th style={style} className="px-3 py-2 font-semibold whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="px-3 py-2 align-top">
      {children}
    </td>
  ),
}

const remarkPlugins = [remarkGfm]

export function Markdown({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div className={`min-w-0 break-words ${className}`}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
