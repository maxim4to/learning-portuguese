import { Children, cloneElement, createContext, isValidElement, useContext, type ComponentProps } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { encodeSource, type PtSource } from '@/features/words/source'
import { cx } from './cx'

/**
 * Markdown renderer for theory / pt-vs-br / common-errors blocks.
 * GFM enabled (tables, ~~strike~~). Typography is styled by hand with Tailwind;
 * tables are plain row-ruled grids on ≥sm and turn into stacked records on phones (no page overflow).
 */
const components: Components = {
  h1: ({ children }) => <h2 className="mt-7 mb-2 font-display first:mt-0">{children}</h2>,
  h2: ({ children }) => <h2 className="mt-7 mb-2 font-display first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-5 mb-2 first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-4 mb-1 font-semibold first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-3 measure first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-3 measure list-disc space-y-1.5 pl-6 marker:text-ink-subtle">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 measure list-decimal space-y-1.5 pl-6 marker:text-ink-subtle">{children}</ol>,
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
  table: ({ children, node }) => (
    <HeadersContext.Provider value={headerTexts(node)}>
      <div className="my-4 min-w-0 sm:overflow-x-auto sm:overscroll-x-contain">
        <table className="w-full border-collapse text-left text-sm leading-snug max-sm:block">{children}</table>
      </div>
    </HeadersContext.Provider>
  ),
  thead: ({ children }) => <thead className="max-sm:hidden">{children}</thead>,
  tbody: ({ children }) => <tbody className="max-sm:block max-sm:border-t max-sm:border-line">{children}</tbody>,
  tr: ({ children }) => {
    // Hand each cell its column index so it can lay itself out as a stacked record below `sm`.
    let col = 0
    const cells = Children.map(children, (c) =>
      isValidElement<{ col?: number }>(c) ? cloneElement(c, { col: col++ }) : c,
    )
    return <tr className="border-b border-line last:border-b-0 max-sm:block max-sm:py-3">{cells}</tr>
  },
  th: ({ children, style }) => (
    <th
      style={style}
      className="border-b border-line-strong px-3 pt-1 pb-2 align-bottom text-sm font-semibold whitespace-nowrap text-ink-muted first:pl-0"
    >
      {children}
    </th>
  ),
  td: Cell as Components['td'],
}

/** Header texts of the current table, used as inline labels in the phone layout. */
const HeadersContext = createContext<string[]>([])

type HastNode = { type: string; tagName?: string; value?: string; children?: HastNode[] }

function textOf(n: HastNode): string {
  return n.type === 'text' ? (n.value ?? '') : (n.children ?? []).map(textOf).join('')
}

function headerTexts(node?: HastNode): string[] {
  const thead = node?.children?.find((c) => c.tagName === 'thead')
  const row = thead?.children?.find((c) => c.tagName === 'tr')
  return (row?.children ?? []).filter((c) => c.tagName === 'th').map((c) => textOf(c).trim())
}

/**
 * Table cell. ≥sm: a plain cell. Below sm the row becomes a record: column 1 + column 2 on the first line,
 * the remaining cells stacked underneath in muted type, each prefixed with its header as a label.
 */
function Cell({ children, style, col = 0 }: ComponentProps<'td'> & { col?: number }) {
  const headers = useContext(HeadersContext)
  const label = col >= 2 ? headers[col] : undefined
  return (
    <td
      style={style}
      className={cx(
        'px-3 py-2 align-top first:pl-0 max-sm:p-0',
        col === 0 && 'max-sm:inline max-sm:font-semibold',
        col === 1 && 'max-sm:inline',
        col >= 2 && 'max-sm:mt-1 max-sm:block max-sm:text-sm max-sm:text-ink-muted',
      )}
    >
      {col === 1 && (
        <span aria-hidden className="text-ink-subtle sm:hidden">
          {' — '}
        </span>
      )}
      {label && <span className="mr-1.5 text-xs font-semibold text-ink-subtle sm:hidden">{label}:</span>}
      {children}
    </td>
  )
}

const remarkPlugins = [remarkGfm]

/**
 * `pt`: the text has pt-PT examples inside Russian prose (theory, cheat-sheets, explanations) — selecting a
 * pt word or phrase (no Cyrillic, ≤ 6 words) offers the lookup card; single taps stay off here (no `lang`).
 * Pass a source (`{ kind: 'cheatsheet', id }`) so saved words link back to it.
 */
export function Markdown({ children, className = '', pt }: { children: string; className?: string; pt?: boolean | PtSource }) {
  return (
    <div
      className={`min-w-0 break-words ${className}`}
      data-lookup={pt ? 'select' : undefined}
      data-pt-src={pt && pt !== true ? encodeSource(pt) : undefined}
    >
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
