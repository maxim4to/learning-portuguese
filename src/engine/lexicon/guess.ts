/**
 * Lemma guesser for forms the lexicon does not index (theory markdown, manual search, words outside the
 * course corpus): strips known endings and proposes candidate lemmas with a morphological tag.
 *
 *   guessLemmas('falaremos') → [{ lemma: 'falar', pos: 'verb', tag: 'FI1p' }, …]
 *   guessLemmas('canções')   → [{ lemma: 'canção', pos: 'noun', tag: 'PL' }, …]
 *
 * Candidates are NOT checked here: `lookup.ts` keeps only those whose lemma exists in the lexicon (with the
 * matching part of speech) and marks them approximate («возможно»). The offline `extract` ranks them by
 * corpus support to suggest lemmas for content/lexicon/_todo.json. Pure module, shared with scripts.
 */
import { GERUND_ENDING, PARTICIPLE_ENDING, PERSONS, REGULAR_ENDINGS, TENSES, type VerbClass } from './endings.ts'

export type GuessPos = 'verb' | 'nominal' | 'adv'

export interface Guess {
  lemma: string
  /** 'nominal' = noun or adjective (or determiner / pronoun). */
  pos: GuessPos
  /** Morph tag (./endings.ts); several slots comma-joined. */
  tag: string
  /** Length of the stripped ending (longer = more specific). */
  weight: number
}

interface Rule {
  ending: string
  /** Lemma ending to append to the stem. */
  add: string
  pos: GuessPos
  tag: string
  cls?: VerbClass
}

function buildRules(): Rule[] {
  const rules = new Map<string, Rule>()
  const put = (r: Rule) => {
    const key = `${r.ending}|${r.add}|${r.pos}`
    const prev = rules.get(key)
    if (!prev) rules.set(key, r)
    else if (!prev.tag.split(',').includes(r.tag)) prev.tag += ',' + r.tag
  }
  for (const cls of ['ar', 'er', 'ir'] as const) {
    const E = REGULAR_ENDINGS[cls]
    for (const t of TENSES) {
      E[t].forEach((ending, i) => {
        if (ending) put({ ending, add: cls, pos: 'verb', tag: t + PERSONS[i], cls })
      })
    }
    put({ ending: GERUND_ENDING[cls], add: cls, pos: 'verb', tag: 'GER', cls })
    const pp = PARTICIPLE_ENDING[cls]
    const ppf = pp.slice(0, -1) + 'a'
    for (const [ending, tag] of [[pp, 'PP'], [ppf, 'PPF'], [pp + 's', 'PPPL'], [ppf + 's', 'PPFPL']] as const) {
      put({ ending, add: cls, pos: 'verb', tag, cls })
    }
  }
  // Vowel-stem -air / -uir (saímos, incluía, construído) and -oer (rói, roído)
  const vowelStem: [string, string][] = [
    ['ímos', 'PI1p,PPS1p'], ['ís', 'PI2p'], ['í', 'PPS1s'], ['íste', 'PPS2s'], ['íram', 'PPS3p,MQP3p'],
    ['ía', 'II1s,II3s'], ['ías', 'II2s'], ['íamos', 'II1p'], ['íam', 'II3p'], ['ísse', 'IC1s,IC3s'], ['íssemos', 'IC1p'],
    ['íssem', 'IC3p'], ['íres', 'FC2s,INFP2s'], ['írem', 'FC3p,INFP3p'], ['ído', 'PP'], ['ída', 'PPF'], ['ídos', 'PPPL'], ['ídas', 'PPFPL'],
  ]
  for (const [ending, tag] of vowelStem) put({ ending, add: 'ir', pos: 'verb', tag, cls: 'ir' })
  put({ ending: 'io', add: 'ir', pos: 'verb', tag: 'PI1s', cls: 'ir' }) // saio
  put({ ending: 'is', add: 'ir', pos: 'verb', tag: 'PI2s', cls: 'ir' }) // sais, incluis
  put({ ending: 'i', add: 'ir', pos: 'verb', tag: 'PI3s,IMP2s', cls: 'ir' }) // sai, inclui
  put({ ending: 'uz', add: 'uzir', pos: 'verb', tag: 'PI3s,IMP2s', cls: 'ir' }) // produz

  const nominal: [string, string, string][] = [
    ['ões', 'ão', 'PL'], ['ães', 'ão', 'PL'], ['ãos', 'ão', 'PL'], ['ãs', 'ão', 'FPL'], ['ã', 'ão', 'F'],
    ['ais', 'al', 'PL'], ['éis', 'el', 'PL'], ['eis', 'el', 'PL'], ['eis', 'il', 'PL'], ['óis', 'ol', 'PL'], ['ois', 'ol', 'PL'],
    ['uis', 'ul', 'PL'], ['is', 'il', 'PL'], ['ns', 'm', 'PL'], ['res', 'r', 'PL'], ['zes', 'z', 'PL'], ['ses', 's', 'PL'],
    ['eses', 'ês', 'PL'], ['s', '', 'PL'],
    ['a', 'o', 'F'], ['as', 'o', 'FPL'], ['ora', 'or', 'F'], ['oras', 'or', 'FPL'], ['esa', 'ês', 'F'], ['esas', 'ês', 'FPL'],
    ['eia', 'eu', 'F'], ['eias', 'eu', 'FPL'],
    ['inho', 'o', 'DIM'], ['inha', 'a', 'DIM'], ['inhos', 'o', 'DIM'], ['inhas', 'a', 'DIM'], ['inho', 'e', 'DIM'], ['inha', 'e', 'DIM'],
    ['zinho', '', 'DIM'], ['zinha', '', 'DIM'], ['zinhos', '', 'DIM'], ['zinhas', '', 'DIM'],
    ['íssimo', 'o', 'SUP'], ['íssima', 'o', 'SUP'], ['íssimos', 'o', 'SUP'], ['íssimas', 'o', 'SUP'], ['íssimo', 'e', 'SUP'], ['íssima', 'e', 'SUP'],
  ]
  for (const [ending, add, tag] of nominal) put({ ending, add, pos: 'nominal', tag })
  put({ ending: 'amente', add: 'o', pos: 'adv', tag: 'ADV' })
  put({ ending: 'mente', add: '', pos: 'adv', tag: 'ADV' })
  return [...rules.values()].sort((a, b) => b.ending.length - a.ending.length)
}

let RULES: Rule[] | null = null

const VOWEL_AT = /[aeiouáéíóúâêôãõ]/

/** Stem variants undoing orthographic alternations and stem-vowel changes of the conjugator. */
function verbStems(stem: string, rule: Rule): string[] {
  const out = [stem]
  const e0 = rule.ending[0]
  if (rule.cls === 'ar' && /[eé]/.test(e0)) {
    if (stem.endsWith('qu')) out.push(stem.slice(0, -2) + 'c') // fiquei → ficar
    else if (stem.endsWith('gu')) out.push(stem.slice(0, -1)) // paguei → pagar
    else if (stem.endsWith('c')) out.push(stem.slice(0, -1) + 'ç') // comecei → começar
  }
  if (rule.cls !== 'ar' && /[aoáó]/.test(e0)) {
    if (stem.endsWith('ç')) out.push(stem.slice(0, -1) + 'c') // conheço → conhecer
    else if (stem.endsWith('j')) out.push(stem.slice(0, -1) + 'g') // protejo → proteger
    else if (stem.endsWith('g')) out.push(stem + 'u') // sigo → seguir (with e/i below)
    else if (stem.endsWith('c')) out.push(stem.slice(0, -1) + 'qu')
  }
  // -ear / odiar: passei-o → passe-ar, odei-o → odi-ar
  for (const s of [...out]) if (rule.cls === 'ar' && s.endsWith('ei')) out.push(s.slice(0, -1), s.slice(0, -2) + 'i')
  // e → i (sinto → sentir), o → u (durmo → dormir), u → o (sobe → subir)
  if (rule.cls === 'ir') {
    for (const s of [...out]) {
      const end = /[gq]u$/.test(s) ? s.length - 1 : s.length
      for (let i = end - 1; i >= 0; i--) {
        if (!VOWEL_AT.test(s[i])) continue
        const swap = s[i] === 'i' ? 'e' : s[i] === 'u' ? 'o' : s[i] === 'o' ? 'u' : null
        if (swap) out.push(s.slice(0, i) + swap + s.slice(i + 1))
        break
      }
    }
  }
  return [...new Set(out)]
}

/**
 * All candidate lemmas for a normalised form (most specific ending first). Unchecked: may contain
 * non-words; the caller filters them against the lexicon or ranks them by corpus support.
 */
export function guessLemmas(form: string): Guess[] {
  RULES ??= buildRules()
  const out: Guess[] = []
  const seen = new Map<string, Guess>()
  for (const r of RULES) {
    if (!form.endsWith(r.ending)) continue
    const stem = form.slice(0, form.length - r.ending.length)
    if (stem.length < (r.pos === 'verb' ? 1 : 2) && !(r.pos === 'nominal' && r.add)) continue
    if (r.pos === 'verb' && !VOWEL_AT.test(stem) && stem.length < 2) continue
    const stems = r.pos === 'verb' ? verbStems(stem, r) : [stem]
    for (const s of stems) {
      const lemma = s + r.add
      if (!lemma || lemma === form || lemma.length < 2) continue
      const key = `${lemma}|${r.pos}`
      const prev = seen.get(key)
      if (prev) {
        for (const t of r.tag.split(',')) if (!prev.tag.split(',').includes(t)) prev.tag += ',' + t
        continue
      }
      const g: Guess = { lemma, pos: r.pos, tag: r.tag, weight: r.ending.length }
      seen.set(key, g)
      out.push(g)
    }
  }
  return out
}
