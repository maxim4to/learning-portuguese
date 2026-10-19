/** Splits reading paragraphs into plain text and glossary-word segments. */

export interface Segment {
  text: string
  /** Index into the glossary when this segment is a glossary word. */
  gi?: number
}

const norm = (s: string) => s.normalize('NFC').toLocaleLowerCase('pt-PT')
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Builds a splitter that finds glossary words (case-insensitive, whole words only,
 * longest match first so multi-word entries win over their parts).
 */
export function makeSegmenter(glossary: readonly { word: string }[]): (text: string) => Segment[] {
  const byWord = new Map<string, number>()
  glossary.forEach((g, i) => {
    const k = norm(g.word.trim())
    if (k && !byWord.has(k)) byWord.set(k, i)
  })
  if (!byWord.size) return (text) => [{ text }]
  const alts = [...byWord.keys()].sort((a, b) => b.length - a.length).map((w) => escape(w).replace(/\s+/g, '\\s+'))
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, 'giu')

  return (raw) => {
    const text = raw.normalize('NFC')
    const out: Segment[] = []
    let last = 0
    for (const m of text.matchAll(re)) {
      const at = m.index ?? 0
      const gi = byWord.get(norm(m[0]).replace(/\s+/g, ' '))
      if (gi === undefined) continue
      if (at > last) out.push({ text: text.slice(last, at) })
      out.push({ text: m[0], gi })
      last = at + m[0].length
    }
    if (last < text.length) out.push({ text: text.slice(last) })
    return out
  }
}
