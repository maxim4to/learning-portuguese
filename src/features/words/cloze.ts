/**
 * Cloze («пропуск в предложении») helpers for dictionary words: masking the seen form in its source
 * sentence and the answers accepted for the gap. Pure (relative imports, no React) — used by wordOps,
 * status and scripts/words.test.ts.
 */
import type { WordEntry, WordSource } from '../../data/types.ts'

export const GAP = '___'

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Regex source for a form, tolerant to typography: any hyphen / dash joins clitics («levanto‑me»),
 * any apostrophe («d’água»), any run of spaces.
 */
function formPattern(form: string): string {
  return [...form.normalize('NFC').trim()]
    .map((ch) => (/[-‐‑‒–]/.test(ch) ? '[-‐‑‒–]' : /['’‘ʼ]/.test(ch) ? "['’‘ʼ]" : /\s/.test(ch) ? '\\s+' : escapeRe(ch)))
    .join('')
}

/**
 * Replaces every whole-word occurrence of `form` (case-insensitive, NFC, hyphen/apostrophe-tolerant) with `___`.
 * A hyphenated form («levanto-me») is masked as one unit; a bare form inside a hyphenated word keeps the clitic
 * («levanto» in «levanto-me» → «___-me»). Unchanged if not found.
 */
export function maskForm(sentence: string, form: string): string {
  if (!form.trim()) return sentence
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${formPattern(form)}(?![\\p{L}\\p{N}])`, 'giu')
  return sentence.normalize('NFC').replace(re, GAP)
}

export interface ClozeSource {
  source: WordSource
  /** The form that was masked (the seen form, or the lemma as a fallback). */
  form: string
  /** Sentence with the form replaced by `___`. */
  masked: string
}

/** Newest source whose sentence actually contains the seen form (or the lemma) — the cloze card's sentence. */
export function clozeSource(entry: Pick<WordEntry, 'sources' | 'lemma'>): ClozeSource | undefined {
  for (let i = entry.sources.length - 1; i >= 0; i--) {
    const source = entry.sources[i]
    const sentence = source.sentence?.trim()
    if (!sentence) continue
    for (const form of [source.form, entry.lemma]) {
      if (!form?.trim()) continue
      const masked = maskForm(sentence, form)
      if (masked !== sentence.normalize('NFC')) return { source, form: form.trim(), masked }
    }
  }
  return undefined
}

const ARTICLES: Record<NonNullable<WordEntry['gender']>, string[]> = { m: ['o'], f: ['a'], mf: ['o', 'a'] }
const HAS_ARTICLE = /^(o|a|os|as|o\/a)\s/i

/**
 * Answers accepted for the cloze gap: the seen form; for a noun whose form is the lemma, also with its article
 * («saúde», «a saúde»).
 */
export function clozeAnswers(entry: Pick<WordEntry, 'lemma' | 'pos' | 'gender'>, form: string): string[] {
  const out = [form]
  const isNoun = entry.pos === 'noun' || (entry.pos === undefined && entry.gender !== undefined)
  if (isNoun && entry.gender && !HAS_ARTICLE.test(form) && form.toLowerCase() === entry.lemma.toLowerCase()) {
    for (const a of ARTICLES[entry.gender]) out.push(`${a} ${form}`)
  }
  return out
}

/**
 * Answers accepted when the word itself is typed (RU → PT, listening): the display form with its article and the bare
 * lemma (the article is optional; «o/a utente» accepts «o utente», «a utente», «utente»).
 */
export function wordAnswers(entry: Pick<WordEntry, 'lemma' | 'pos' | 'gender'>): string[] {
  const lemma = entry.lemma.trim()
  const out = new Set<string>([lemma])
  const isNoun = entry.pos === 'noun' || (entry.pos === undefined && entry.gender !== undefined)
  if (isNoun && entry.gender && !HAS_ARTICLE.test(lemma)) for (const a of ARTICLES[entry.gender]) out.add(`${a} ${lemma}`)
  const bare = lemma.replace(HAS_ARTICLE, '')
  if (bare !== lemma) out.add(bare)
  return [...out]
}

/**
 * Splits `sentence` into plain / masked segments using its masked version (`maskForm` output), so the seen form
 * can be emphasised: «Levanto-me cedo.» + «___ cedo.» → [{ text: 'Levanto-me', form: true }, { text: ' cedo.' }].
 * Returns one plain segment when nothing was masked.
 */
export function splitByMask(sentence: string, masked: string): { text: string; form?: true }[] {
  const parts = masked.split(GAP)
  const full = sentence.normalize('NFC')
  if (parts.length < 2) return [{ text: full }]
  const out: { text: string; form?: true }[] = []
  let pos = 0
  parts.forEach((p, i) => {
    if (p) out.push({ text: p })
    pos += p.length
    if (i < parts.length - 1) {
      const next = parts[i + 1]
      const end = next ? full.indexOf(next, pos) : full.length
      const form = full.slice(pos, end < 0 ? full.length : end)
      out.push({ text: form, form: true })
      pos += form.length
    }
  })
  return out
}
