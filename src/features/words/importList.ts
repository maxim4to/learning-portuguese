/**
 * «Импорт списка»: pasted lines «palavra — перевод» → dictionary inputs. Pure (relative imports, no React / DOM) —
 * unit-tested in scripts/words.test.ts.
 *
 *   const parsed = parseImportList(text)              // lines, separators, duplicates, skipped lines
 *   const rows = resolveImportRows(lex, parsed.items, existing)   // lexicon lemma / pos / gender + conflicts
 *   saveWords(rows.filter(picked).map(importRowInput))
 *
 * Separators: « — », « – », « - » (a hyphen needs spaces around it: «levantar-se» stays one word), tab, «;», «=».
 * Ignored: empty lines, a header like «СЛОВА:», list markers («1.», «-», «•», «*»), code fences.
 */
import type { LexEntry, Lexicon } from '../../engine/lexicon/lookup.ts'
import type { WordEntry, WordPos } from '../../data/types.ts'
import { normalizeLemma, wordIdFor, type NewWordInput } from './wordOps.ts'

export const IMPORT_MAX_LINES = 300

export interface ImportItem {
  /** 1-based line number in the pasted text (the first occurrence). */
  line: number
  /** As written, without list markers: «o pão», «levantar-se». */
  pt: string
  ru: string
  /** Later lines with the same pt (merged into this one; their translations are added when different). */
  duplicates: number[]
}

export interface ImportSkip {
  line: number
  text: string
  reason: 'no-separator' | 'no-pt' | 'no-ru' | 'too-many'
}

export interface ParsedImport {
  items: ImportItem[]
  skipped: ImportSkip[]
  /** The text looks like the agent's «СЛОВА:» block (source «Из беседы с агентом»). */
  fromTutor: boolean
}

const HEADER = /^\s*(?:слова|words|palavras)\s*:?\s*$/iu
const FENCE = /^\s*```/
const MARKER = /^\s*(?:\d{1,3}[.)]\s+|[-*•·–—]\s+)/u
/** Separator candidates, strongest first. Each splits at the first occurrence. */
const SEPARATORS: RegExp[] = [/\t+/, /\s+[—–]\s*|\s*[—–]\s+|[—–]/, /\s+-\s+/, /\s*;\s*/, /\s*=\s*/]
const CYRILLIC = /\p{Script=Cyrillic}/u
const LATIN = /\p{Script=Latin}/u

const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/^[«"'“„]+|[»"'”]+$/gu, '').replace(/[.,;:]+$/u, '').trim()

/** Splits one line into pt and ru (null when no separator is found). Swapped «перевод — palavra» is accepted. */
export function splitImportLine(raw: string): { pt: string; ru: string } | null {
  const line = raw.replace(MARKER, '')
  for (const sep of SEPARATORS) {
    const m = sep.exec(line)
    if (!m || m.index === 0) continue
    let pt = tidy(line.slice(0, m.index))
    let ru = tidy(line.slice(m.index + m[0].length))
    if (!pt && !ru) continue
    if (CYRILLIC.test(pt) && !CYRILLIC.test(ru) && LATIN.test(ru)) [pt, ru] = [ru, pt]
    return { pt, ru }
  }
  return null
}

/** Dedupe key of a pt word: normalised, without a leading article («o pão» = «pão»). */
export function importKey(pt: string): string {
  return normalizeLemma(stripArticle(pt).rest)
}

const ARTICLE_RE = /^(o\/a|a\/o|os\/as|o|a|os|as|um|uma)\s+(?=\S)/i

/** «o pão» → { article: 'o', rest: 'pão' }; parenthesised notes are dropped («pão (m)» → «pão»). */
export function stripArticle(pt: string): { article?: string; rest: string } {
  const t = pt.replace(/\s*\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  const m = ARTICLE_RE.exec(t)
  return m ? { article: m[1].toLowerCase(), rest: t.slice(m[0].length).trim() } : { rest: t }
}

export function parseImportList(text: string): ParsedImport {
  const items: ImportItem[] = []
  const skipped: ImportSkip[] = []
  const byKey = new Map<string, ImportItem>()
  let fromTutor = false
  const lines = text.split(/\r\n|\r|\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const n = i + 1
    if (!raw.trim() || FENCE.test(raw)) continue
    if (HEADER.test(raw)) {
      fromTutor = true
      continue
    }
    const parts = splitImportLine(raw)
    if (!parts) {
      skipped.push({ line: n, text: raw.trim(), reason: 'no-separator' })
      continue
    }
    if (!parts.pt || CYRILLIC.test(parts.pt)) {
      skipped.push({ line: n, text: raw.trim(), reason: 'no-pt' })
      continue
    }
    if (!parts.ru) {
      skipped.push({ line: n, text: raw.trim(), reason: 'no-ru' })
      continue
    }
    const key = importKey(parts.pt)
    const prev = byKey.get(key)
    if (prev) {
      prev.duplicates.push(n)
      const meanings = prev.ru.split(/;\s*/)
      if (!meanings.some((m) => m.toLowerCase() === parts.ru.toLowerCase())) prev.ru = `${prev.ru}; ${parts.ru}`
      continue
    }
    if (items.length >= IMPORT_MAX_LINES) {
      skipped.push({ line: n, text: raw.trim(), reason: 'too-many' })
      continue
    }
    const item: ImportItem = { line: n, pt: parts.pt, ru: parts.ru, duplicates: [] }
    byKey.set(key, item)
    items.push(item)
  }
  return { items, skipped, fromTutor }
}

// ─── Lexicon ──────────────────────────────────────────────────────────────────

export type ImportRowState = 'found' | 'own' | 'exists'

export interface ImportRow {
  item: ImportItem
  /** Lexicon entry (lemma / pos / gender / level) — undefined: saved with the learner's own translation. */
  entry?: LexEntry
  /** Other readings of the form (e.g. «como»: comer / como). */
  alternatives: LexEntry[]
  lemma: string
  pos?: WordPos
  gender?: 'm' | 'f' | 'mf'
  /** Dictionary id the row saves to. */
  id: string
  state: ImportRowState
  /** Already saved: the entry (its translation is kept; the import adds a source only). */
  existing?: WordEntry
  /** Another line of this import resolves to the same word (line number of the first). */
  sameAs?: number
}

function articleGender(article: string | undefined): 'm' | 'f' | 'mf' | undefined {
  if (!article) return undefined
  if (article.includes('/')) return 'mf'
  return article === 'a' || article === 'as' || article === 'uma' ? 'f' : 'm'
}

/** Best lexicon entry for a pasted word: the lemma itself first, a noun when an article was written. */
export function matchImportEntry(lex: Lexicon, pt: string): { entry?: LexEntry; alternatives: LexEntry[] } {
  const { article, rest } = stripArticle(pt)
  const key = normalizeLemma(rest)
  const cands = lex.resolve(rest).filter((c) => !c.approximate)
  if (!cands.length) return { alternatives: [] }
  const score = (e: LexEntry, i: number) =>
    (normalizeLemma(e.lemma) === key ? 0 : 10) + (article && e.pos === 'noun' ? 0 : article ? 5 : 0) + i * 0.01
  const sorted = cands.map((c, i) => ({ e: c.entry, s: score(c.entry, i) })).sort((a, b) => a.s - b.s)
  const entries = [...new Map(sorted.map((x) => [x.e.id, x.e])).values()]
  return { entry: entries[0], alternatives: entries.slice(1, 4) }
}

/** Lexicon lookup for each item + conflicts with the dictionary and between lines. */
export function resolveImportRows(
  lex: Lexicon | null,
  items: readonly ImportItem[],
  existing: ReadonlyMap<string, WordEntry>,
): ImportRow[] {
  const firstById = new Map<string, number>()
  return items.map((item) => {
    const { article, rest } = stripArticle(item.pt)
    const m = lex ? matchImportEntry(lex, item.pt) : { alternatives: [] as LexEntry[] }
    const entry = m.entry
    const lemma = entry?.lemma ?? rest
    const pos: WordPos | undefined = entry?.pos ?? (article ? 'noun' : undefined)
    const gender = articleGender(article) ?? entry?.gender
    const id = wordIdFor({ lexId: entry?.id, lemma })
    const prior = existing.get(id)
    const sameAs = firstById.get(id)
    if (sameAs === undefined) firstById.set(id, item.line)
    return {
      item,
      entry,
      alternatives: m.alternatives,
      lemma,
      pos,
      gender: pos === 'noun' ? gender : entry?.gender,
      id,
      state: prior ? 'exists' : entry ? 'found' : 'own',
      existing: prior,
      sameAs,
    }
  })
}

/** Rows picked by default: new words, one per dictionary id. */
export const importRowDefault = (r: ImportRow) => r.state !== 'exists' && r.sameAs === undefined

/** Save input for a row (the pasted translation goes first; lexicon meanings are not added). */
export function importRowInput(r: ImportRow, opts: { src: string; now?: number }): NewWordInput {
  return {
    lexId: r.entry?.id,
    lemma: r.lemma,
    ru: r.item.ru,
    pos: r.pos,
    gender: r.gender,
    level: r.entry?.level,
    source: { src: opts.src, form: r.item.pt, at: opts.now },
  }
}
