/**
 * Runtime lexicon types. The bundle (`src/generated/lexicon.json`) is produced offline by
 * `npm run lexicon -- build` from `content/lexicon/*.json` and loaded lazily (see ./lookup.ts).
 */
import type { Level } from '../../content/schema.ts'
import type { Contraction } from './normalize.ts'

export type LexPos = 'noun' | 'verb' | 'adj' | 'adv' | 'prep' | 'pron' | 'det' | 'conj' | 'num' | 'interj' | 'phrase'
export type LexGender = 'm' | 'f' | 'mf'

/** Bit flags in `LexEntryTuple[6]`. */
export const LEX_FLAG = {
  /** Reflexive verb lemma (levantar-se). */
  reflexive: 1,
  /** Lemma has several words (ter de, casa de banho) — matched as an expression. */
  multiword: 2,
} as const

/** [id, lemma, pos, ru («; »-joined), gender | '', level | '', flags] */
export type LexEntryTuple = [string, string, LexPos, string, LexGender | '', Level | '', number]

export interface LexiconBundle {
  v: 1
  /** sha1 of the inputs (content/**.json) — stale-bundle check. */
  hash: string
  entries: LexEntryTuple[]
  /**
   * Normalised form → [[entryIndex, morphTag], …]. Lemmas, explicit `forms`, and regular
   * plural / feminine forms that occur in the corpus. morphTag: '' = lemma, 'X' = explicit
   * form (unspecified), 'PL' plural, 'F' feminine, 'FPL' feminine plural.
   */
  forms: Record<string, [number, string][]>
  /** 'vocab:<themeId>' | 'situation:<id>' | 'reading:<id>' → entry indices. */
  themes: Record<string, number[]>
  /** Entry indices with pre-generated lemma audio (filled by a later phase). */
  audio?: number[]
}

export interface LexEntry {
  /** Index in `bundle.entries`. */
  index: number
  /** `lemma#pos[#sense]` — stable id, used as `WordEntry.lexId`. */
  id: string
  lemma: string
  pos: LexPos
  /** Meanings, most frequent first. */
  ru: string[]
  gender?: LexGender
  level?: Level
  reflexive: boolean
  multiword: boolean
  /** Theme keys ('vocab:saude', 'situation:no-cafe', 'reading:a2-…') this lemma comes from. */
  themes: string[]
}

export type LexMatchVia = 'exact' | 'article' | 'contraction' | 'clitic'

export interface LexCandidate {
  entry: LexEntry
  /** Normalised form that was looked up (as tapped): 'levanto-me'. */
  form: string
  /** Key that hit the forms index: 'levanto', 'fazer', 'de'. */
  matched: string
  /** morphTag of the hit ('' = lemma itself; see LexiconBundle.forms). */
  tag: string
  via: LexMatchVia
  /** Leading article stripped from the selection ('o' in «o pequeno-almoço»). */
  article?: string
  /** Contraction the hit came from: «do» → { prep: 'de', rest: 'o' }. */
  contraction?: Contraction
  /** Detached pronouns: levanto-me → ['me']; dir-lhe-ei → ['lhe']. */
  clitics?: string[]
  mesoclitic?: boolean
  /** Found only by the accent-insensitive fallback («voce» → «você»): show as «возможно». */
  approximate: boolean
}

/** Optional neighbouring tokens (normalised or raw) to rank ambiguous forms. */
export interface LookupContext {
  prev?: string
  next?: string
}

export interface MweMatch {
  /** Token span [start, end) in the given tokens array. */
  start: number
  end: number
  entries: LexEntry[]
}
