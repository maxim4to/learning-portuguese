/** Lookup card options (pure; relative imports only — unit-tested in scripts/words.test.ts). */
import type { LexCandidate, LexEntry, Lexicon } from '../../../engine/lexicon/lookup.ts'

/** What the options need from a capture target (hitTest.ts → CaptureTarget). */
export interface LookupInput {
  form: string
  prev?: string
  next?: string
  /** Sentence tokens and the tapped token index (expressions around the word). */
  tokens?: readonly string[]
  tokenIndex?: number
  multi: boolean
}

/** One reading of the tapped text: an expression around it, or a lexicon candidate for the form. */
export interface LookupOption {
  entry: LexEntry
  cand?: LexCandidate
  /** Expression found around the word (offered first). */
  mwe?: boolean
}

/** Expressions up to this many words are offered before the word itself. */
const MWE_FIRST_MAX = 4

/** Expressions around the word first (lex.matchMwe), then the candidates of the form (lex.resolve). */
export function lookupOptions(lex: Lexicon, t: LookupInput): LookupOption[] {
  const out: LookupOption[] = []
  const seen = new Set<string>()
  const push = (o: LookupOption) => {
    if (seen.has(o.entry.id)) return
    seen.add(o.entry.id)
    out.push(o)
  }
  let long: LexEntry[] = []
  if (!t.multi && t.tokens && t.tokenIndex !== undefined) {
    const { tokens, tokenIndex: i } = t
    const m = lex.matchMwe(tokens, i)
    if (m && m.end - m.start <= MWE_FIRST_MAX) m.entries.forEach((entry) => push({ entry, mwe: true }))
    else if (m) {
      // A whole stored sentence («Queria abrir uma conta à ordem.»): the shorter expression inside it goes
      // first («abrir uma conta»), the sentence after the word itself.
      long = m.entries
      let best: { len: number; entries: LexEntry[] } | null = null
      for (let s = Math.max(0, i - MWE_FIRST_MAX + 1); s <= i; s++) {
        const sub = lex.matchMwe(tokens.slice(s, s + MWE_FIRST_MAX), i - s)
        if (sub && (!best || sub.end - sub.start > best.len)) best = { len: sub.end - sub.start, entries: sub.entries }
      }
      best?.entries.forEach((entry) => push({ entry, mwe: true }))
    }
  }
  for (const cand of lex.resolve(t.form, { prev: t.prev, next: t.next })) push({ entry: cand.entry, cand })
  long.forEach((entry) => push({ entry, mwe: true }))
  return out
}
