/**
 * Layout of content/lexicon/*.json — designed so several content agents can fill disjoint files in parallel.
 *
 *   function.json            служебные слова: prep, pron, det, conj, num (+ частые наречия и междометия)
 *   verbs-<range>.json       глаголы (pos verb), в т. ч. возвратные и глагольные выражения
 *   nouns-<range>.json       существительные (pos noun), в т. ч. составные и имена собственные
 *   words-<range>.json       прилагательные, наречия, междометия, фразы (adj, adv, interj, phrase)
 *
 * <range> is a slice of the alphabet by the first letter of the lemma (diacritics folded; digits → first slice).
 * One slice = one agent: it owns verbs-<range>, nouns-<range>, words-<range>.
 */
import type { LexEntrySource, LexPosValue } from '../../src/content/schema.ts'
import { foldDiacritics, normalizeForm } from '../../src/engine/lexicon/normalize.ts'

/** Alphabet slices [first, last] (inclusive). Changing them: edit here, then `npm run lexicon -- format`. */
export const SLICES: readonly (readonly [string, string])[] = [
  ['a', 'c'],
  ['d', 'i'],
  ['j', 'p'],
  ['q', 'z'],
]

export const FUNCTION_FILE = 'function.json'
export const FUNCTION_POS: ReadonlySet<LexPosValue> = new Set(['prep', 'pron', 'det', 'conj', 'num'])

export type FileGroup = 'verbs' | 'nouns' | 'words'

export function groupOf(pos: LexPosValue): FileGroup | 'function' {
  if (FUNCTION_POS.has(pos)) return 'function'
  if (pos === 'verb') return 'verbs'
  if (pos === 'noun') return 'nouns'
  return 'words'
}

/** 'a-c' … for a lemma (first latin letter after folding diacritics). */
export function sliceOf(lemma: string): string {
  const c = foldDiacritics(normalizeForm(lemma))[0] ?? 'a'
  const s = SLICES.find(([a, b]) => c >= a && c <= b) ?? SLICES[0]
  return `${s[0]}-${s[1]}`
}

/** Canonical file of an entry. */
export function fileFor(e: Pick<LexEntrySource, 'lemma' | 'pos'>): string {
  const g = groupOf(e.pos)
  return g === 'function' ? FUNCTION_FILE : `${g}-${sliceOf(e.lemma)}.json`
}

/** All canonical file names (for `format` and the README). */
export function allFiles(): string[] {
  const out = [FUNCTION_FILE]
  for (const g of ['verbs', 'nouns', 'words'] as const) for (const [a, b] of SLICES) out.push(`${g}-${a}-${b}.json`)
  return out
}

/**
 * Is `file` an acceptable home for the entry? Its canonical file, or function.json for frequent
 * adverbs / interjections / short phrases curated there (não, já, muito, olá, por favor).
 */
export function isPlacedOk(file: string, e: Pick<LexEntrySource, 'lemma' | 'pos'>): boolean {
  if (file === fileFor(e)) return true
  return file === FUNCTION_FILE && (e.pos === 'adv' || e.pos === 'interj' || e.pos === 'phrase')
}
