/** Cheat-sheet helpers: title / intro / table of contents parsed from the markdown source. */
import { listCheatsheets, type Cheatsheet } from '@/content'

/** Preferred order on the hub; unknown ids follow alphabetically. */
const ORDER = [
  'tempos-verbais',
  'verbos-irregulares',
  'pronomes-cliticos',
  'preposicoes-contracoes',
  'conectores',
  'pt-pt-vs-pt-br',
]

export interface TocEntry {
  level: 2 | 3
  text: string
}

export interface ParsedCheatsheet {
  id: string
  title: string
  /** First paragraph after the title (plain text), if any. */
  intro?: string
  /** Markdown without the leading `# Title` line. */
  body: string
  /** `##` / `###` headings of `body` in document order (`#` counts as level 2, as the Markdown renderer maps it to h2). */
  toc: TocEntry[]
}

/** Strips inline markdown (emphasis, code, links) for plain-text display. */
export function plainText(md: string): string {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseCheatsheet(c: Cheatsheet): ParsedCheatsheet {
  const lines = c.markdown.replace(/\r\n?/g, '\n').split('\n')
  let title = c.id
  const titleAt = lines.findIndex((l) => l.trim() !== '')
  if (titleAt >= 0 && /^#\s+/.test(lines[titleAt])) {
    title = plainText(lines[titleAt].replace(/^#\s+/, ''))
    lines.splice(titleAt, 1)
  }
  const body = lines.join('\n').trim()

  const toc: TocEntry[] = []
  let fenced = false
  for (const l of lines) {
    if (/^\s*(```|~~~)/.test(l)) fenced = !fenced
    if (fenced) continue
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(l)
    if (m) toc.push({ level: m[1].length === 3 ? 3 : 2, text: plainText(m[2]) })
  }

  const firstPara = body.split(/\n\s*\n/).find((p) => p.trim() && !/^\s*(#|\||>|-|\*|\d+\.)/.test(p))
  return { id: c.id, title, intro: firstPara ? plainText(firstPara) : undefined, body, toc }
}

export function listParsedCheatsheets(): ParsedCheatsheet[] {
  const rank = (id: string) => {
    const i = ORDER.indexOf(id)
    return i < 0 ? ORDER.length : i
  }
  return listCheatsheets()
    .map(parseCheatsheet)
    .sort((a, b) => rank(a.id) - rank(b.id) || a.title.localeCompare(b.title, 'ru'))
}
