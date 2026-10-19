/**
 * Pure text helpers for tutor prompts: markdown → compact plain text, smart truncation,
 * exercise → one-line task. No React / Vite APIs (also used by Node scripts).
 */
import type { Exercise } from '@/content/schema.ts'

/** Cuts `s` to at most `max` chars on a word boundary, adding «…». */
export function clip(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.–—-]+$/, '')}…`
}

/** Inline markdown → plain: drops bold/italic markers and backticks, keeps the text (and ✗/✓ marks). */
export function stripInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[^\p{L}*])\*([^*\n]+)\*(?![\p{L}*])/gu, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
}

const isTableSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)

/** One markdown line → compact plain line (tables become «a | b | c», headings «▸ Title»). */
function plainLine(line: string): string | null {
  if (isTableSep(line)) return null
  const h = /^#{1,6}\s+(.*)$/.exec(line)
  if (h) return `▸ ${stripInline(h[1]).trim()}`
  if (/^\s*\|/.test(line)) {
    const cells = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => stripInline(c).trim())
    // Empty header cell (e.g. «| | falar | comer |») — keep the column position readable.
    return cells.map((c) => c || '·').join(' | ')
  }
  return stripInline(line).replace(/\s+$/, '')
}

/**
 * Markdown → compact plain text, at most ~`max` chars. Splits at headings; if everything doesn't fit,
 * every section keeps its heading and first lines (usually the rule itself) — the budget is shared
 * fairly («water-filling»: short sections whole, long ones trimmed line by line with «…»).
 */
export function compressMarkdown(md: string, max: number): string {
  const sections: string[][] = []
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    if (/^#{1,6}\s/.test(raw) || sections.length === 0) sections.push([])
    const l = plainLine(raw)
    if (l !== null) sections[sections.length - 1].push(l)
  }
  const bodies = sections
    .map((sec) => sec.join('\n').replace(/\n{3,}/g, '\n\n').trim())
    .filter(Boolean)
  const total = bodies.reduce((n, b) => n + b.length + 2, 0)
  if (total <= max) return bodies.join('\n\n')

  // Fair share per section: sections shorter than the share are kept whole, the rest split what's left.
  const alloc = new Array<number>(bodies.length).fill(0)
  const order = bodies.map((_, i) => i).sort((a, b) => bodies[a].length - bodies[b].length)
  let left = max
  order.forEach((i, k) => {
    const share = Math.floor(left / (order.length - k))
    alloc[i] = Math.min(bodies[i].length + 2, share)
    left -= alloc[i]
  })
  return bodies
    .map((b, i) => {
      if (b.length + 2 <= alloc[i]) return b
      const out: string[] = []
      let size = 0
      for (const l of b.split('\n')) {
        // Trimmed section: lead-in lines («…выбирает между двумя временами:») and blank lines carry no rule.
        if (out.length && (!l.trim() || /:\s*$/.test(l))) continue
        if (size + l.length + 1 > alloc[i] - 2 && out.length) break
        out.push(l)
        size += l.length + 1
      }
      while (out.length && !out[out.length - 1].trim()) out.pop()
      return `${out.join('\n')}\n…`
    })
    .join('\n\n')
}

/** Exercise → one-line task with its answer after «→» (for the tutor's task bank). Audio-only types → null. */
export function exerciseLine(ex: Exercise): string | null {
  const p = (s: string) => stripInline(s).replace(/\s+/g, ' ').trim()
  switch (ex.type) {
    case 'fill-gap':
      return `${p(ex.prompt)} → ${ex.answer[0]}`
    case 'choice':
      return `${p(ex.prompt)} [${ex.options.join(' / ')}] → ${ex.options[ex.correct]}`
    case 'transform':
      return `${p(ex.instruction).replace(/[.:]+$/, '')}: ${p(ex.prompt)} → ${ex.answer[0]}`
    case 'order-words':
      return `Составить фразу из слов: ${ex.words.join(' / ')} → ${ex.answer}`
    case 'translate-ru-pt':
      return `Перевести: «${p(ex.ru)}» → ${ex.answer[0]}`
    case 'match':
      return `Сопоставить: ${ex.pairs.map((x) => `${x.left} = ${x.right}`).join('; ')}`
    default:
      return null
  }
}

/** Picks up to `n` exercise lines, alternating exercise types so the bank is varied. */
export function pickExerciseLines(list: readonly Exercise[], n: number): string[] {
  const byType = new Map<string, string[]>()
  for (const ex of list) {
    const line = exerciseLine(ex)
    if (!line || line.length > 260) continue
    const arr = byType.get(ex.type) ?? []
    arr.push(line)
    byType.set(ex.type, arr)
  }
  const queues = [...byType.values()]
  const out: string[] = []
  for (let round = 0; out.length < n && queues.some((q) => q.length > round); round++) {
    for (const q of queues) {
      if (out.length >= n) break
      if (q[round]) out.push(q[round])
    }
  }
  return out
}

export const numbered = (items: readonly string[]) => items.map((s, i) => `${i + 1}. ${s}`).join('\n')
export const bulleted = (items: readonly string[]) => items.map((s) => `- ${s}`).join('\n')
