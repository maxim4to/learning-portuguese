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
   * Normalised form → [[entryIndex, morphTag], …]. Lemmas, explicit `forms`, pt-BR variants (`br`) and the
   * generated forms (conjugation, plural / feminine) that occur in the course corpus. morphTag: '' = lemma,
   * 'X' = explicit form (unanalysed), 'PI1s' / 'PPS1p' / 'GER' / 'PP' … verb forms, 'PL' / 'F' / 'FPL' nominal,
   * 'BR' pt-BR; several tags of one entry are comma-joined ('PC1s,PC3s,IMP3s'). Labels: ./morph.ts.
   */
  forms: Record<string, [number, string][]>
  /** 'vocab:<themeId>' | 'situation:<id>' | 'reading:<id>' → entry indices. */
  themes: Record<string, number[]>
  /**
   * Verb entry index → `conj` of the source entry (only entries that set it). The app conjugates verb lemmas at
   * lookup time (./conjugate.ts) for forms the corpus-bound `forms` index does not hold — clitic hosts
   * (sentou-se → sentou, dir-lhe-ei → direi) and manual search.
   */
  conj?: Record<string, string>
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

/** How the form was matched; 'guess' = lemma proposed by ./guess.ts (always approximate). */
export type LexMatchVia = 'exact' | 'article' | 'contraction' | 'clitic' | 'guess'

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
  /** Found only by the accent-insensitive fallback («voce» → «você») or the ending guesser: show as «возможно». */
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
