/**
 * pt-PT word-form normalisation shared by the app (lookup on tap / search) and the offline
 * lexicon pipeline (scripts/lexicon.ts). Pure: no DOM, no `import.meta`, relative imports only.
 *
 * - `normalizeForm`: NFC, lower case, unified apostrophes/hyphens, punctuation trimmed;
 *   multi-word input is re-joined token by token with single spaces.
 * - `foldDiacritics`: accent/cedilla-insensitive key (fallback lookup).
 * - `splitContraction`: do = de + o, na = em + a, àquele = a + aquele, pelo = por + o …
 * - `splitClitics`: levanto-me, fazê-lo → fazer, dir-lhe-ei → direi, far-se-ia → faria.
 * - `stripArticle`: «o pequeno-almoço» → «pequeno-almoço».
 * - `analyzeForm`: all lookup keys for one tapped form, in priority order.
 */

const HYPHENS = /[‐‑‒–—―−­]/g
const APOSTROPHES = /[‘’ʼ´`]/g

/** A word: letters/digits, optionally joined by hyphens or apostrophes (levanto-me, d'água, T2). */
const WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['-][\p{L}\p{M}\p{N}]+)*/gu

export interface Token {
  /** As written in the text. */
  text: string
  /** `normalizeToken(text)` */
  norm: string
  start: number
  end: number
}

function normalizeToken(s: string): string {
  return s.normalize('NFC').toLocaleLowerCase('pt-PT')
}

/**
 * Splits pt text into word tokens (hyphenated clitic forms and compounds stay one token).
 * `start`/`end` index the ORIGINAL string (also for decomposed NFD text: hyphen/apostrophe unification is
 * length-preserving and NFC is applied per token only); `text` is the token in NFC with unified punctuation.
 */
export function tokenize(text: string): Token[] {
  const s = text.replace(HYPHENS, '-').replace(APOSTROPHES, "'")
  const out: Token[] = []
  for (const m of s.matchAll(WORD_RE)) {
    const t = m[0].normalize('NFC')
    out.push({ text: t, norm: normalizeToken(t), start: m.index, end: m.index + m[0].length })
  }
  return out
}

/** Canonical lookup key of a word or a phrase: «Levanto-me,» → «levanto-me»; «Se faz favor!» → «se faz favor». */
export function normalizeForm(s: string): string {
  return tokenize(s)
    .map((t) => t.norm)
    .join(' ')
}

/** Accent- and cedilla-insensitive key: «Pôr» → «por», «açúcar» → «acucar». Expects a normalised form. */
export function foldDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC')
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export const ARTICLES: Readonly<Record<string, { gender: 'm' | 'f'; plural: boolean; definite: boolean }>> = {
  o: { gender: 'm', plural: false, definite: true },
  a: { gender: 'f', plural: false, definite: true },
  os: { gender: 'm', plural: true, definite: true },
  as: { gender: 'f', plural: true, definite: true },
  um: { gender: 'm', plural: false, definite: false },
  uma: { gender: 'f', plural: false, definite: false },
  uns: { gender: 'm', plural: true, definite: false },
  umas: { gender: 'f', plural: true, definite: false },
}

/** «o pequeno-almoço» → { article: 'o', rest: 'pequeno-almoço' }. Null for a single word or no leading article. */
export function stripArticle(form: string): { article: string; rest: string } | null {
  const n = normalizeForm(form)
  const sp = n.indexOf(' ')
  if (sp < 0) return null
  const first = n.slice(0, sp)
  return first in ARTICLES ? { article: first, rest: n.slice(sp + 1) } : null
}

/**
 * Words after which a leading «a» is the preposition, not the feminine article: «a pé», «a cavalo», «a sério»,
 * «a pouco e pouco», «a meio», «a propósito», «a não ser que»… (masculine nouns, adverbs, numerals, «não»).
 */
const PREP_A_HEADS = new Set(
  'pé cavalo sério tempo pouco meio propósito bordo prazo pronto crédito menos não fim caminho nado sós medo gosto longo saber dois três quatro cinco seis sete oito nove dez cem mil horas título exemplo cargo'.split(
    ' ',
  ),
)

/**
 * Does a content phrase start with the preposition «a» rather than the article «a»? «a pé» → true,
 * «a partir de» → true (infinitive / masculine or adverbial head), «a saúde» → false.
 */
export function startsWithPrepositionA(pt: string): boolean {
  const words = normalizeForm(pt).split(' ')
  if (words.length < 2 || words[0] !== 'a') return false
  const head = words[1]
  // «a» + infinitive (a partir de, a começar por): a feminine noun in -ar/-ir is rare enough to ignore
  return PREP_A_HEADS.has(head) || /^\p{L}+(?:ar|ir)$/u.test(head)
}

// ---------------------------------------------------------------------------
// Contractions (preposition + article / pronoun / demonstrative / adverb)
// ---------------------------------------------------------------------------

export interface Contraction {
  /** Preposition: de, em, a, por. */
  prep: string
  /** Contracted word: o, um, este, isto, ele, aqui, onde, outro… */
  rest: string
}

const CONTRACTION_BASES = [
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  'este', 'esta', 'estes', 'estas', 'isto',
  'esse', 'essa', 'esses', 'essas', 'isso',
  'aquele', 'aquela', 'aqueles', 'aquelas', 'aquilo',
  'ele', 'ela', 'eles', 'elas',
  'outro', 'outra', 'outros', 'outras',
]

function buildContractions(): Map<string, Contraction> {
  const m = new Map<string, Contraction>()
  const add = (form: string, prep: string, rest: string) => m.set(form, { prep, rest })
  for (const b of CONTRACTION_BASES) {
    // de: do, dum, deste, disto, dele, doutro …
    add('d' + b, 'de', b)
    // em: no, num, neste, nisto, nele, noutro …
    add('n' + b, 'em', b)
  }
  // a + article / aquele
  add('ao', 'a', 'o')
  add('aos', 'a', 'os')
  add('à', 'a', 'a')
  add('às', 'a', 'as')
  for (const b of ['aquele', 'aquela', 'aqueles', 'aquelas', 'aquilo']) add('à' + b.slice(1), 'a', b)
  // por + article
  for (const b of ['o', 'a', 'os', 'as']) add('pel' + b, 'por', b)
  // de + adverbs
  add('daqui', 'de', 'aqui')
  add('daí', 'de', 'aí')
  add('dali', 'de', 'ali')
  add('donde', 'de', 'onde')
  add('dantes', 'de', 'antes')
  add('aonde', 'a', 'onde')
  // «de»+«o»: no ambiguity with the clitic «no»/«na» here — contractions only apply to whole words.
  return m
}

const CONTRACTIONS = buildContractions()

/** Elided «de» before a vowel: copo d'água, caixa d'óculos, estrela d'alva. */
const ELIDED_DE = /^d'([\p{L}\p{M}].*)$/u

/** Contraction of an already normalised single word. */
function contractionOf(n: string): Contraction | null {
  const c = CONTRACTIONS.get(n)
  if (c) return c
  const m = ELIDED_DE.exec(n)
  return m ? { prep: 'de', rest: m[1] } : null
}

/** «do» → { prep: 'de', rest: 'o' }; «àquele» → { prep: 'a', rest: 'aquele' }; «d'água» → de + água; else null. */
export function splitContraction(form: string): Contraction | null {
  return contractionOf(normalizeForm(form))
}

// ---------------------------------------------------------------------------
// Clitic pronouns attached with a hyphen (enclisis, mesoclisis)
// ---------------------------------------------------------------------------

export const CLITICS: ReadonlySet<string> = new Set([
  'me', 'te', 'se', 'nos', 'vos', 'lhe', 'lhes',
  'o', 'a', 'os', 'as', 'lo', 'la', 'los', 'las', 'no', 'na', 'nas',
  'mo', 'ma', 'mos', 'mas', 'to', 'ta', 'tos', 'tas', 'lho', 'lha', 'lhos', 'lhas',
])
/** Pronouns that can mark a reflexive verb (levantar-se). */
export const REFLEXIVE_CLITICS: ReadonlySet<string> = new Set(['me', 'te', 'se', 'nos', 'vos'])
const L_CLITICS = new Set(['lo', 'la', 'los', 'las'])
/** Endings of futuro / condicional that follow a mesoclitic pronoun: dir-lhe-ei, far-se-ia. */
const MESO_ENDINGS = new Set(['ei', 'ás', 'á', 'emos', 'eis', 'ão', 'ia', 'ias', 'íamos', 'íeis', 'iam'])

export interface CliticSplit {
  /** Candidate verb forms in priority order (infinitive restorations first). */
  hosts: string[]
  /** Detached pronouns, in written order: ['me'], ['lhe'], ['se']. */
  clitics: string[]
  mesoclitic: boolean
  /** The first clitic can mark a reflexive verb (try «lemma-se» first). */
  reflexive: boolean
}

const uniq = (xs: string[]) => [...new Set(xs)]

/**
 * Restores the verb form before -lo/-la/-los/-las, which drops the final -r/-s/-z
 * and may add an accent: comprá-lo → comprar, fazê-lo → fazer, parti-lo → partir, pô-lo → pôr,
 * fá-lo → faz, di-lo → diz, qui-lo → quis, fazemo-lo → fazemos, vê-lo → ver / vês.
 */
function restoreBeforeL(host: string): string[] {
  const stem = host.slice(0, -1)
  const last = host.slice(-1)
  switch (last) {
    case 'á':
      return [stem + 'ar', stem + 'ás', stem + 'az', host]
    case 'ê':
      return [stem + 'er', stem + 'ês', stem + 'ez', host]
    case 'í':
      return [stem + 'ir', stem + 'ís', host]
    case 'ô':
      return [stem + 'ôr', stem + 'or', stem + 'ôs', host]
    case 'i':
      return [host + 'r', host + 'z', host + 's', host]
    default:
      return [host + 's', host + 'r', host + 'z', host]
  }
}

/** Restores the future/conditional stem before a mesoclitic -lo: fá-lo-ei → far(ei), dir-lho-ia → dir(ia). */
function restoreMesoStem(stem: string): string {
  const last = stem.slice(-1)
  const base = stem.slice(0, -1)
  if (last === 'á') return base + 'ar'
  if (last === 'ê') return base + 'er'
  if (last === 'í') return base + 'ir'
  if (last === 'ô') return base + 'or'
  return stem.endsWith('r') ? stem : stem + 'r'
}

/**
 * Splits hyphen-attached clitics. Returns null for words without clitics (incl. compounds
 * like «pequeno-almoço», whose parts are not pronouns).
 */
export function splitClitics(form: string): CliticSplit | null {
  const n = normalizeForm(form)
  if (n.includes(' ')) return null
  const parts = n.split('-')
  if (parts.length < 2 || !parts[0]) return null

  // Mesoclisis: dir-lhe-ei, far-se-ia, dá-lo-ei
  if (parts.length >= 3 && MESO_ENDINGS.has(parts[parts.length - 1])) {
    const middle = parts.slice(1, -1)
    if (middle.every((p) => CLITICS.has(p))) {
      const stem = L_CLITICS.has(middle[0]) ? restoreMesoStem(parts[0]) : parts[0]
      return {
        hosts: [stem + parts[parts.length - 1]],
        clitics: middle,
        mesoclitic: true,
        reflexive: REFLEXIVE_CLITICS.has(middle[0]),
      }
    }
  }

  // Enclisis: levanto-me, dá-me, diz-lhe, fazê-lo, levantamo-nos, deu-mo
  const clitics = parts.slice(1)
  if (!clitics.every((p) => CLITICS.has(p))) return null
  const host = parts[0]
  let hosts = [host]
  if (L_CLITICS.has(clitics[0])) hosts = restoreBeforeL(host)
  else if (clitics[0] === 'nos' && host.endsWith('mo')) hosts = [host + 's', host] // levantamo-nos → levantamos
  return { hosts: uniq(hosts), clitics, mesoclitic: false, reflexive: REFLEXIVE_CLITICS.has(clitics[0]) }
}

// ---------------------------------------------------------------------------
// Analysis: every lookup key for one form
// ---------------------------------------------------------------------------

export type AnalysisVia = 'exact' | 'article' | 'contraction' | 'clitic'

export interface FormAnalysis {
  /** Normalised key to look up in the lexicon forms index. */
  key: string
  via: AnalysisVia
  /** Leading article removed (via 'article'). */
  article?: string
  /** Contraction this key came from (via 'contraction'): key is `prep` or `rest`. */
  contraction?: Contraction
  /** Which half of the contraction this key is (via 'contraction'). */
  half?: 'prep' | 'rest'
  /** Detached pronouns (via 'clitic'). */
  clitics?: string[]
  mesoclitic?: boolean
  /** Prefer the «-se» lemma (levantar-se) for this key. */
  reflexive?: boolean
}

/**
 * All keys to try for a tapped/selected form, most specific first:
 * the form itself → without a leading article → contraction parts → clitic hosts.
 */
export function analyzeForm(form: string): FormAnalysis[] {
  const n = normalizeForm(form)
  if (!n) return []
  const out: FormAnalysis[] = [{ key: n, via: 'exact' }]
  const art = stripArticle(n)
  if (art) out.push({ key: art.rest, via: 'article', article: art.article })
  if (!n.includes(' ')) {
    const c = contractionOf(n)
    if (c) {
      out.push({ key: c.prep, via: 'contraction', contraction: c, half: 'prep' })
      out.push({ key: c.rest, via: 'contraction', contraction: c, half: 'rest' })
    }
    const cl = splitClitics(n)
    if (cl) {
      for (const h of cl.hosts) {
        out.push({ key: h, via: 'clitic', clitics: cl.clitics, mesoclitic: cl.mesoclitic, reflexive: cl.reflexive })
      }
    }
  }
  return out
}

/** Reflexive lemma for a verb lemma: «levantar» → «levantar-se»; «ter de» → «ter-se de» is not attempted. */
export function reflexiveLemma(lemma: string): string | null {
  const n = normalizeForm(lemma)
  if (n.includes(' ') || n.endsWith('-se')) return null
  return n + '-se'
}
