/**
 * Regular pt-PT verb endings and morphological tag codes, shared by the offline conjugator
 * (scripts/lexicon/conjugate.ts) and the runtime guesser (./guess.ts). Pure data, no imports.
 *
 * Tag grammar (bundle `forms[key] = [[entryIndex, tag], …]`, several tags comma-joined):
 *   ''            lemma itself (infinitive for verbs)
 *   <T><P>        finite verb form: tense T ∈ TENSES, person P ∈ PERSONS — 'PI1s', 'PPS1p', 'IMP2s'
 *   GER           gerúndio                      PP / PPF / PPPL / PPFPL   particípio (м./ж. р., ед./мн. ч.)
 *   PL / F / FPL  noun/adjective plural, feminine, feminine plural
 *   DIM / SUP     diminutive / superlative (-inho, -íssimo; guesser only)
 *   ADV           adverb in -mente from an adjective (guesser only)
 *   BR            pt-BR spelling or word (entry.br) — «в Бразилии»
 *   X             explicit extra form from the entry's `forms` (no analysis)
 */

export type VerbClass = 'ar' | 'er' | 'ir'

export const PERSONS = ['1s', '2s', '3s', '1p', '2p', '3p'] as const
export type Person = (typeof PERSONS)[number]

/** Finite tenses / moods, in display order. */
export const TENSES = ['PI', 'PPS', 'II', 'MQP', 'FI', 'CD', 'PC', 'IC', 'FC', 'IMP', 'INFP'] as const
export type Tense = (typeof TENSES)[number]

/** Non-finite and nominal tags. */
export const SIMPLE_TAGS = ['GER', 'PP', 'PPF', 'PPPL', 'PPFPL', 'PL', 'F', 'FPL', 'DIM', 'SUP', 'ADV', 'BR', 'X'] as const

type Row = readonly [string, string, string, string, string, string]

/**
 * Endings appended to the stem (infinitive minus -ar/-er/-ir). '' = no form (imperative 1s).
 * pt-PT: pretérito perfeito 1p of -ar verbs is «-ámos» (falámos ≠ falamos).
 */
export const REGULAR_ENDINGS: Record<VerbClass, Record<Tense, Row>> = {
  ar: {
    PI: ['o', 'as', 'a', 'amos', 'ais', 'am'],
    PPS: ['ei', 'aste', 'ou', 'ámos', 'astes', 'aram'],
    II: ['ava', 'avas', 'ava', 'ávamos', 'áveis', 'avam'],
    MQP: ['ara', 'aras', 'ara', 'áramos', 'áreis', 'aram'],
    FI: ['arei', 'arás', 'ará', 'aremos', 'areis', 'arão'],
    CD: ['aria', 'arias', 'aria', 'aríamos', 'aríeis', 'ariam'],
    PC: ['e', 'es', 'e', 'emos', 'eis', 'em'],
    IC: ['asse', 'asses', 'asse', 'ássemos', 'ásseis', 'assem'],
    FC: ['ar', 'ares', 'ar', 'armos', 'ardes', 'arem'],
    IMP: ['', 'a', 'e', 'emos', 'ai', 'em'],
    INFP: ['ar', 'ares', 'ar', 'armos', 'ardes', 'arem'],
  },
  er: {
    PI: ['o', 'es', 'e', 'emos', 'eis', 'em'],
    PPS: ['i', 'este', 'eu', 'emos', 'estes', 'eram'],
    II: ['ia', 'ias', 'ia', 'íamos', 'íeis', 'iam'],
    MQP: ['era', 'eras', 'era', 'êramos', 'êreis', 'eram'],
    FI: ['erei', 'erás', 'erá', 'eremos', 'ereis', 'erão'],
    CD: ['eria', 'erias', 'eria', 'eríamos', 'eríeis', 'eriam'],
    PC: ['a', 'as', 'a', 'amos', 'ais', 'am'],
    IC: ['esse', 'esses', 'esse', 'êssemos', 'êsseis', 'essem'],
    FC: ['er', 'eres', 'er', 'ermos', 'erdes', 'erem'],
    IMP: ['', 'e', 'a', 'amos', 'ei', 'am'],
    INFP: ['er', 'eres', 'er', 'ermos', 'erdes', 'erem'],
  },
  ir: {
    PI: ['o', 'es', 'e', 'imos', 'is', 'em'],
    PPS: ['i', 'iste', 'iu', 'imos', 'istes', 'iram'],
    II: ['ia', 'ias', 'ia', 'íamos', 'íeis', 'iam'],
    MQP: ['ira', 'iras', 'ira', 'íramos', 'íreis', 'iram'],
    FI: ['irei', 'irás', 'irá', 'iremos', 'ireis', 'irão'],
    CD: ['iria', 'irias', 'iria', 'iríamos', 'iríeis', 'iriam'],
    PC: ['a', 'as', 'a', 'amos', 'ais', 'am'],
    IC: ['isse', 'isses', 'isse', 'íssemos', 'ísseis', 'issem'],
    FC: ['ir', 'ires', 'ir', 'irmos', 'irdes', 'irem'],
    IMP: ['', 'e', 'a', 'amos', 'i', 'am'],
    INFP: ['ir', 'ires', 'ir', 'irmos', 'irdes', 'irem'],
  },
}

export const GERUND_ENDING: Record<VerbClass, string> = { ar: 'ando', er: 'endo', ir: 'indo' }
export const PARTICIPLE_ENDING: Record<VerbClass, string> = { ar: 'ado', er: 'ido', ir: 'ido' }
