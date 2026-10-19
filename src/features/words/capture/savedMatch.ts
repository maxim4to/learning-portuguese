/**
 * Saved-word matching for the text highlights (./highlights.ts): which tokens of a pt text are words the learner is
 * still learning. Pure (no DOM / React; relative imports) — unit-tested in scripts/integrations.test.ts.
 */
import type { WordEntry, WordStatus } from '../../../data/types.ts'
import type { Lexicon } from '../../../engine/lexicon/lookup.ts'
import { normalizeForm, tokenize, type Token } from '../../../engine/lexicon/normalize.ts'

/** Statuses that are marked in texts. */
export const MARKED: ReadonlySet<WordStatus> = new Set(['new', 'learning'])
const CYRILLIC = /\p{Script=Cyrillic}/u
export const LETTER = /\p{L}/u

export interface SavedMatcher {
  lex: Lexicon
  /** Lexicon ids of marked words. */
  lexIds: ReadonlySet<string>
  /** Normalised lemmas of marked words without a lexicon id (`u:*`). */
  lemmas: ReadonlySet<string>
  /** Normalised multi-word lemmas (token-joined) of marked words; longest first is tried. */
  phrases: ReadonlySet<string>
  maxPhrase: number
}

/** Matcher for the marked words (null when there is nothing to mark). */
export function buildSavedMatcher(
  lex: Lexicon,
  words: readonly WordEntry[],
  statuses: ReadonlyMap<string, WordStatus>,
): SavedMatcher | null {
  const lexIds = new Set<string>()
  const lemmas = new Set<string>()
  const phrases = new Set<string>()
  let maxPhrase = 0
  for (const w of words) {
    const s = statuses.get(w.id)
    if (!s || !MARKED.has(s)) continue
    const key = normalizeForm(w.lemma)
    if (!key) continue
    const n = key.split(' ').length
    if (n > 1) {
      phrases.add(key)
      maxPhrase = Math.max(maxPhrase, n)
    } else if (w.lexId) lexIds.add(w.lexId)
    else lemmas.add(key)
  }
  if (!lexIds.size && !lemmas.size && !phrases.size) return null
  return { lex, lexIds, lemmas, phrases, maxPhrase }
}

/** Per-lexicon cache: normalised token → ids of its exact (non-approximate) candidates. */
const candCache = new WeakMap<Lexicon, Map<string, readonly string[]>>()
const CACHE_MAX = 30_000

function candidateIds(lex: Lexicon, norm: string): readonly string[] {
  let cache = candCache.get(lex)
  if (!cache) candCache.set(lex, (cache = new Map()))
  let ids = cache.get(norm)
  if (!ids) {
    ids = lex.resolve(norm).filter((c) => !c.approximate).map((c) => c.entry.id)
    if (cache.size > CACHE_MAX) cache.clear()
    cache.set(norm, ids)
  }
  return ids
}

/** Whether a single token is a marked word: its best reading (with the previous token as context) is saved. */
function tokenIsSaved(m: SavedMatcher, tok: Token, prev: string | undefined, next: string | undefined): boolean {
  if (m.lemmas.has(tok.norm)) return true
  if (!m.lexIds.size) return false
  const ids = candidateIds(m.lex, tok.norm)
  if (!ids.some((id) => m.lexIds.has(id))) return false
  if (ids.length === 1) return true
  // Ambiguous form («como», «era»): only when the context-ranked first reading is the saved one.
  const best = m.lex.resolve(tok.text, { prev, next }).find((c) => !c.approximate)
  return !!best && m.lexIds.has(best.entry.id)
}

export interface TextRangeSpan {
  start: number
  end: number
}

/**
 * Spans of marked words in one text. `latinOnly`: Russian text with pt examples (markdown) — tokens with Cyrillic
 * are skipped. `prev`: the token before the text (context across inline elements).
 */
export function savedSpans(text: string, m: SavedMatcher, opts: { latinOnly?: boolean; prev?: string } = {}): TextRangeSpan[] {
  const toks = tokenize(text)
  const out: TextRangeSpan[] = []
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (!LETTER.test(t.text) || (opts.latinOnly && CYRILLIC.test(t.text))) continue
    if (m.maxPhrase > 1) {
      let hit = 0
      for (let len = Math.min(m.maxPhrase, toks.length - i); len >= 2; len--) {
        let key = t.norm
        for (let k = 1; k < len; k++) key += ' ' + toks[i + k].norm
        if (m.phrases.has(key)) {
          hit = len
          break
        }
      }
      if (hit) {
        out.push({ start: t.start, end: toks[i + hit - 1].end })
        i += hit - 1
        continue
      }
    }
    const prev = i > 0 ? toks[i - 1].norm : opts.prev
    if (tokenIsSaved(m, t, prev, toks[i + 1]?.norm)) out.push({ start: t.start, end: t.end })
  }
  return out
}
