import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Markdown renderer for theory / pt-vs-br / common-errors blocks.
 * GFM enabled (tables, ~~strike~~). Typography is styled by hand with Tailwind;
 * wide tables scroll horizontally inside their own container (no page overflow on mobile).
 */
const components: Components = {
  h1: ({ children }) => <h2 className="mt-7 mb-2 font-display first:mt-0">{children}</h2>,
  h2: ({ children }) => <h2 className="mt-7 mb-2 font-display first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-5 mb-2 first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-4 mb-1 font-semibold first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-3 max-w-[68ch] first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-3 max-w-[68ch] list-disc space-y-1.5 pl-6 marker:text-ink-subtle">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 max-w-[68ch] list-decimal space-y-1.5 pl-6 marker:text-ink-subtle">{children}</ol>,
  li: ({ children }) => <li className="pl-1 [&>ol]:my-1.5 [&>ul]:my-1.5">{children}</li>,
  strong: ({ children }) => <strong className="font-bold text-ink">{children}</strong>,
  em: ({ children }) => <em className="text-brand-ink italic">{children}</em>,
  del: ({ children }) => (
    <del className="text-danger decoration-danger/60 decoration-2">{children}</del>
  ),
  a: ({ href, children }) => (
    <a href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="underline">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 rounded-r-control border-l-4 border-brand bg-surface-2 py-2.5 pr-4 pl-4 text-ink">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="rule-dotted my-6 border-0" />,
  code: ({ children, className }) => {
    // Fenced blocks get a language-* class; inline code doesn't.
    if (className) return <code className={className}>{children}</code>
    return (
      <code className="rounded-md bg-sun-soft px-1.5 py-0.5 font-mono text-[0.9em] text-ink">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-control bg-surface-2 p-3 font-mono text-sm leading-relaxed">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-4 -mx-1 w-[calc(100%+0.5rem)] max-w-[calc(100vw-2rem)] overflow-x-auto overscroll-x-contain rounded-control border border-line md:max-w-none">
      <table className="w-full border-collapse text-left text-[0.9375rem] leading-snug">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-ink text-surface">{children}</thead>,
  tr: ({ children }) => (
    <tr className="border-b border-line last:border-b-0 even:bg-bg/60">
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
