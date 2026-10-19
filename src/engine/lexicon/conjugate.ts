/**
 * pt-PT verb conjugator. Offline, `npm run lexicon -- build` indexes the corpus forms of every verb lemma; in the
 * app, ./lookup.ts loads this module lazily (`verbForms`) to resolve forms outside the corpus (clitic hosts:
 * sentou-se, dir-lhe-ei; manual search). Pure: no DOM, relative imports only.
 *
 *   conjugate('falar')        → full paradigm (all finite tenses, imperativo, infinitivo pessoal, gerúndio, particípio)
 *   conjugate('manter')       → family of «ter» (mantenho, mantém, mantive …)
 *   conjugate('levantar-se')  → same as «levantar» (clitics are handled by normalize.ts at lookup time)
 *   paradigmForms(p)          → Map form → tags ('PI1s', 'PPS1p', 'GER', 'PPF' …; see src/engine/lexicon/endings.ts)
 *
 * Regular classes are detected from the infinitive (see `verbKind`), irregular verbs come from ./irregular.ts.
 * An entry may force a paradigm with `conj`: 'reg' (plain regular, no stem alternation), a table name
 * ('ter' → prefix + ter), or a class alias ('sentir', 'dormir', 'subir', 'odiar', 'agredir', 'passear',
 * 'sair', 'incluir', 'roer', 'produzir').
 */
import {
  PERSONS,
  REGULAR_ENDINGS,
  TENSES,
  type Tense,
  type VerbClass,
} from './endings.ts'
import {
  AGREDIR,
  FAMILIES,
  IRREGULAR,
  NO_ALTERNATION,
  ODIAR,
  PARTICIPLES,
  PARTICIPLE_SUFFIX,
  SUBIR,
  SUFFIX_FAMILIES,
  type IrregularSpec,
  type Slot,
} from './irregular.ts'

/** Variants of one slot; [] = no form (imperativo 1s). */
export type Cell = string[]

export interface Paradigm {
  infinitive: string
  tenses: Record<Tense, Cell[]>
  gerund: string[]
  /** Masculine singular particípio(s). */
  participle: string[]
}

export type VerbKind = 'plain' | 'ear' | 'odiar' | 'e-i' | 'o-u' | 'subir' | 'agredir' | 'air' | 'uir' | 'oer' | 'uzir'

/** `conj` values that name a class rather than a table. */
export const KIND_ALIASES: Readonly<Record<string, VerbKind>> = {
  reg: 'plain',
  sentir: 'e-i',
  dormir: 'o-u',
  subir: 'subir',
  odiar: 'odiar',
  agredir: 'agredir',
  passear: 'ear',
  sair: 'air',
  incluir: 'uir',
  roer: 'oer',
  produzir: 'uzir',
}

const VOWEL = /[aeiouáéíóúâêôãõ]/
const plainInf = (inf: string) => inf.replace(/ô/g, 'o')
const isInfinitive = (s: string) => /^\p{L}*(ar|er|ir|ôr|or)$/u.test(s)

/** Verb class of an infinitive: falar → ar; pôr / propor → er. */
export function verbClass(inf: string): VerbClass | null {
  if (/(ôr|por)$/.test(inf)) return 'er'
  const c = inf.slice(-2)
  return c === 'ar' || c === 'er' || c === 'ir' ? c : null
}

/** Index of the last stem vowel (ignores the silent u of gu/qu: segu-ir → e). */
function lastStemVowel(stem: string): number {
  let end = stem.length
  if (/[gq]u$/.test(stem)) end--
  for (let i = end - 1; i >= 0; i--) if (VOWEL.test(stem[i])) return i
  return -1
}

const replaceAt = (s: string, i: number, ch: string) => s.slice(0, i) + ch + s.slice(i + 1)

/** Regular stem-alternation class from the infinitive. */
export function verbKind(inf: string): VerbKind {
  if (inf.endsWith('ear')) return 'ear'
  if (ODIAR.has(inf)) return 'odiar'
  if (inf.endsWith('air')) return 'air'
  if (/[^gq]uir$/.test(inf)) return 'uir'
  if (inf.endsWith('oer')) return 'oer'
  if (inf.endsWith('uzir')) return 'uzir'
  if (SUBIR.has(inf)) return 'subir'
  if (AGREDIR.has(inf)) return 'agredir'
  if (inf.endsWith('ir') && !NO_ALTERNATION.has(inf)) {
    const stem = inf.slice(0, -2)
    const i = lastStemVowel(stem)
    if (i >= 0 && stem[i] === 'e' && !VOWEL.test(stem[i + 1] ?? '')) return 'e-i'
    if (i >= 0 && stem[i] === 'o' && !VOWEL.test(stem[i - 1] ?? '') && !VOWEL.test(stem[i + 1] ?? '')) return 'o-u'
  }
  return 'plain'
}

/**
 * Stem + ending with orthographic alternations:
 * -ar before e: c → qu, g → gu, ç → c (fiquei, pague, comece);
 * -er/-ir before a/o: c → ç, g → j, gu → g, qu → c (conheço, protejo, sigo).
 */
export function join(stem: string, ending: string, cls: VerbClass): string {
  if (!ending) return stem
  const e0 = ending[0]
  if (cls === 'ar' && /[eéê]/.test(e0)) {
    if (/[gq]u$/.test(stem)) return stem + ending
    if (stem.endsWith('c')) return stem.slice(0, -1) + 'qu' + ending
    if (stem.endsWith('g')) return stem + 'u' + ending
    if (stem.endsWith('ç')) return stem.slice(0, -1) + 'c' + ending
  } else if (cls !== 'ar' && /[aoáó]/.test(e0)) {
    if (stem.endsWith('gu')) return stem.slice(0, -2) + 'g' + ending
    if (stem.endsWith('qu')) return stem.slice(0, -2) + 'c' + ending
    if (stem.endsWith('c')) return stem.slice(0, -1) + 'ç' + ending
    if (stem.endsWith('g')) return stem.slice(0, -1) + 'j' + ending
  }
  return stem + ending
}

/** Accent the last vowel of a preterite stem: fize → fizé(ramos), fala → falá, come → comê, fo → fô. */
function accentLast(stem: string, closedE: boolean): string {
  if (/[áéíóúâêô]/.test(stem)) return stem
  for (let i = stem.length - 1; i >= 0; i--) {
    const c = stem[i]
    const acc = c === 'a' ? 'á' : c === 'i' ? 'í' : c === 'o' ? 'ô' : c === 'u' ? 'ú' : c === 'e' ? (closedE ? 'ê' : 'é') : null
    if (acc) return replaceAt(stem, i, acc)
  }
  return stem
}

const cell = (s: Slot | undefined): Cell | undefined => (s === undefined ? undefined : typeof s === 'string' ? [s] : [...s])
const STRESSED = new Set([0, 1, 2, 5])
const FUT_END = ['ei', 'ás', 'á', 'emos', 'eis', 'ão']
const CD_END = ['ia', 'ias', 'ia', 'íamos', 'íeis', 'iam']

function emptyTenses(): Record<Tense, Cell[]> {
  return Object.fromEntries(TENSES.map((t) => [t, PERSONS.map(() => [] as Cell)])) as Record<Tense, Cell[]>
}

/** Regular paradigm of an infinitive with a stem-alternation class. */
function regular(inf: string, kind: VerbKind, cls: VerbClass): Paradigm {
  const E = REGULAR_ENDINGS[cls]
  const stem = inf.slice(0, -2)
  const T = emptyTenses()
  const v = lastStemVowel(stem)
  const alt = (from: string, to: string) => (v >= 0 && stem[v] === from ? replaceAt(stem, v, to) : stem)

  if (kind === 'air' || kind === 'uir') {
    const s = stem
    const rows: Partial<Record<Tense, string[]>> = {
      PI: kind === 'air' ? ['io', 'is', 'i', 'ímos', 'ís', 'em'] : ['o', 'is', 'i', 'ímos', 'ís', 'em'],
      PPS: ['í', 'íste', 'iu', 'ímos', 'ístes', 'íram'],
      II: ['ía', 'ías', 'ía', 'íamos', 'íeis', 'íam'],
      MQP: ['íra', 'íras', 'íra', 'íramos', 'íreis', 'íram'],
      PC: kind === 'air' ? ['ia', 'ias', 'ia', 'iamos', 'iais', 'iam'] : ['a', 'as', 'a', 'amos', 'ais', 'am'],
      IC: ['ísse', 'ísses', 'ísse', 'íssemos', 'ísseis', 'íssem'],
      FC: ['ir', 'íres', 'ir', 'irmos', 'irdes', 'írem'],
      INFP: ['ir', 'íres', 'ir', 'irmos', 'irdes', 'írem'],
    }
    for (const t of TENSES) {
      const r = rows[t]
      for (let p = 0; p < 6; p++) {
        if (r) T[t][p] = [s + r[p]]
        else if (t === 'FI') T[t][p] = [inf + FUT_END[p]]
        else if (t === 'CD') T[t][p] = [inf + CD_END[p]]
      }
    }
    return { infinitive: inf, tenses: T, gerund: [s + 'indo'], participle: [s + 'ído'] }
  }

  const piStem = (p: number): string => {
    switch (kind) {
      case 'ear':
        return STRESSED.has(p) ? stem + 'i' : stem
      case 'odiar':
        return STRESSED.has(p) ? stem.slice(0, -1) + 'ei' : stem
      case 'e-i':
        return p === 0 ? alt('e', 'i') : stem
      case 'o-u':
        return p === 0 ? alt('o', 'u') : stem
      case 'subir':
        return p === 1 || p === 2 || p === 5 ? alt('u', 'o') : stem
      case 'agredir':
        return STRESSED.has(p) ? alt('e', 'i') : stem
      default:
        return stem
    }
  }
  const pcStem = (p: number): string => {
    switch (kind) {
      case 'ear':
      case 'odiar':
        return piStem(p)
      case 'e-i':
      case 'agredir':
        return alt('e', 'i')
      case 'o-u':
        return alt('o', 'u')
      default:
        return stem
    }
  }

  for (const t of TENSES) {
    if (t === 'IMP') continue
    for (let p = 0; p < 6; p++) {
      const st = t === 'PI' ? piStem(p) : t === 'PC' ? pcStem(p) : stem
      T[t][p] = [join(st, E[t][p], cls)]
    }
  }
  if (kind === 'uzir') T.PI[2] = [stem] // produz, conduz
  if (kind === 'oer') {
    const acc = accentLast(stem, false).replace('ô', 'ó') // ro → ró
    T.PI[1] = [acc + 'is']
    T.PI[2] = [acc + 'i']
    T.PPS[0] = [stem + 'í']
    T.II = ['ía', 'ías', 'ía', 'íamos', 'íeis', 'íam'].map((e) => [stem + e])
  }
  const pp = kind === 'oer' ? stem + 'ído' : stem + (cls === 'ar' ? 'ado' : 'ido')
  return { infinitive: inf, tenses: T, gerund: [plainInf(inf).slice(0, -1) + 'ndo'], participle: [pp] }
}

/** Overrides + derived tenses (PC ← PI 1s, MQP/IC/FC ← PPS 3p, future stem, imperativo). */
function applySpec(p: Paradigm, spec: IrregularSpec | undefined, cls: VerbClass): void {
  const T = p.tenses
  const inf = p.infinitive
  if (spec) {
    for (const t of ['PI', 'PPS', 'II', 'PC'] as const) {
      const row = spec[t]
      if (!row) continue
      for (let i = 0; i < 6; i++) {
        const c = cell(row[i])
        if (c) T[t][i] = c
      }
    }
    const pi1 = cell(spec.PI?.[0])
    if (pi1 && !spec.PC) {
      const E = REGULAR_ENDINGS[cls].PC
      for (let i = 0; i < 6; i++) T.PC[i] = pi1.map((f) => f.slice(0, -1) + E[i])
    }
    if (spec.PPS) {
      const closedE = !!spec.closedE
      const stems = T.PPS[5].map((f) => f.replace(/ram$/, ''))
      const ra = ['ra', 'ras', 'ra', 'ramos', 'reis', 'ram']
      const sse = ['sse', 'sses', 'sse', 'ssemos', 'sseis', 'ssem']
      const r = ['r', 'res', 'r', 'rmos', 'rdes', 'rem']
      for (let i = 0; i < 6; i++) {
        const acc = i === 3 || i === 4
        T.MQP[i] = stems.map((s) => (acc ? accentLast(s, closedE) : s) + ra[i])
        T.IC[i] = stems.map((s) => (acc ? accentLast(s, closedE) : s) + sse[i])
        T.FC[i] = stems.map((s) => s + r[i])
      }
    }
    if (spec.fut) {
      for (let i = 0; i < 6; i++) {
        T.FI[i] = [spec.fut + FUT_END[i]]
        T.CD[i] = [spec.fut + CD_END[i]]
      }
    }
  }
  // Infinitivo pessoal from the infinitive (vowel-stem classes already set it)
  if (!/[^gq]uir$|air$/.test(inf)) {
    const b = plainInf(inf)
    T.INFP = [[inf], [b + 'es'], [inf], [b + 'mos'], [b + 'des'], [b + 'em']]
  }
  // Imperativo afirmativo
  T.IMP = [
    [],
    [...T.PI[2]],
    [...T.PC[2]],
    [...T.PC[3]],
    T.PI[4].map((f) => f.replace(/s$/, '')),
    [...T.PC[5]],
  ]
  if (T.PI[2].length === 1 && /uz$/.test(T.PI[2][0]) && inf.endsWith('uzir')) T.IMP[1].push(T.PI[2][0] + 'e')
  if (spec?.IMP) {
    for (let i = 0; i < 6; i++) {
      const c = cell(spec.IMP[i])
      if (c) T.IMP[i] = c
    }
  }
}

function participleOf(lemma: string, fallback: string[], spec?: IrregularSpec): string[] {
  if (PARTICIPLES[lemma]) return [...PARTICIPLES[lemma]]
  if (spec?.pp) return typeof spec.pp === 'string' ? [spec.pp] : [...spec.pp]
  for (const [suf, pp] of Object.entries(PARTICIPLE_SUFFIX)) if (lemma.endsWith(suf)) return [lemma.slice(0, -suf.length) + pp]
  return fallback
}

/** Family base of a verb: manter → ter, propor → pôr, satisfazer → fazer, despedir → pedir. */
function familyOf(inf: string, conj?: string): string | null {
  if (conj && IRREGULAR[conj] && conj !== inf && inf.endsWith(plainInf(conj))) return conj
  for (const [base, members] of Object.entries(FAMILIES)) if (members.includes(inf)) return base
  for (const suf of SUFFIX_FAMILIES) {
    if (inf.endsWith(suf) && inf !== suf) return suf === 'por' ? 'pôr' : suf
  }
  return null
}

const FAMILY_ACCENT: Record<string, Record<string, string>> = {
  ter: { tem: 'tém', tens: 'téns' },
  vir: { vem: 'vém', vens: 'véns' },
  pôr: { pôr: 'por' },
}

/** Is `conj` a valid value for a lexicon entry? */
export function isValidConj(conj: string): boolean {
  return conj in KIND_ALIASES || conj in IRREGULAR
}

/**
 * Full paradigm of a verb lemma (reflexive «-se» and anything after the first word are ignored by the caller).
 * Returns null if the lemma is not an infinitive.
 */
export function conjugate(lemma: string, conj?: string): Paradigm | null {
  const inf = lemma.trim().toLocaleLowerCase('pt-PT').replace(/-se$/, '')
  if (!isInfinitive(inf)) return null

  if (conj !== 'reg') {
    const base = familyOf(inf, conj)
    if (base && base !== inf) {
      const bp = conjugate(base)
      if (!bp) return null
      const prefix = inf.slice(0, inf.length - plainInf(base).length)
      const acc = FAMILY_ACCENT[base] ?? {}
      const fix = (f: string) => prefix + (acc[f] ?? f)
      const tenses = Object.fromEntries(TENSES.map((t) => [t, bp.tenses[t].map((c) => c.map(fix))])) as Record<Tense, Cell[]>
      return {
        infinitive: inf,
        tenses,
        gerund: bp.gerund.map(fix),
        participle: PARTICIPLES[inf] ? [...PARTICIPLES[inf]] : bp.participle.map(fix),
      }
    }
  }

  const spec = conj === 'reg' ? undefined : IRREGULAR[inf]
  const cls = spec?.cls ?? verbClass(inf)
  if (!cls) return null
  const kind: VerbKind = conj && KIND_ALIASES[conj] ? KIND_ALIASES[conj] : spec ? 'plain' : verbKind(inf)
  // Tables built on a vowel-stem class (construir, destruir) keep it for the rest
  const baseKind: VerbKind = spec && kind === 'plain' ? (/[^gq]uir$/.test(inf) ? 'uir' : inf.endsWith('air') ? 'air' : 'plain') : kind
  const p = regular(inf, baseKind, cls)
  applySpec(p, spec, cls)
  p.participle = participleOf(inf, p.participle, spec)
  return p
}

/** Participle forms with agreement: falado / falada / falados / faladas. */
function participleForms(pp: string): [string, string][] {
  if (pp.endsWith('o')) {
    const f = pp.slice(0, -1) + 'a'
    return [[pp, 'PP'], [f, 'PPF'], [pp + 's', 'PPPL'], [f + 's', 'PPFPL']]
  }
  if (pp.endsWith('e')) return [[pp, 'PP'], [pp + 's', 'PPPL']] // aceite, entregue
  return [[pp, 'PP']]
}

/** Every form of a paradigm → its tags (a form may fill several slots: fale = PC1s, PC3s, IMP3s). */
export function paradigmForms(p: Paradigm): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const add = (form: string, tag: string) => {
    if (!form) return
    const list = out.get(form)
    if (!list) out.set(form, [tag])
    else if (!list.includes(tag)) list.push(tag)
  }
  for (const t of TENSES) p.tenses[t].forEach((c, i) => c.forEach((f) => add(f, t + PERSONS[i])))
  for (const g of p.gerund) add(g, 'GER')
  for (const pp of p.participle) for (const [f, tag] of participleForms(pp)) add(f, tag)
  return out
}

/** One slot as a display string (variants joined with « / »), for tests and debugging. */
export function slot(p: Paradigm, t: Tense, person: number): string {
  return p.tenses[t][person].join(' / ')
}

/** Every form of a verb lemma → tags (null if the lemma is not an infinitive). Runtime generator of ./lookup.ts. */
export function verbForms(lemma: string, conj?: string): Map<string, string[]> | null {
  const p = conjugate(lemma, conj)
  return p ? paradigmForms(p) : null
}
