/**
 * pt-PT noun / adjective inflection for the offline lexicon build: plural and feminine forms.
 * Generated forms enter the runtime bundle only if they occur in the course corpus.
 *
 * Plural: vowel → +s; -ão → -ões by default, -ães / -ãos from the exception lists below (or the entry's
 * `plural`); -al/-ol/-ul → -ais/-óis/-uis; -el → -éis (oxytone) / -eis (fácil-type, accent elsewhere);
 * -il → -is (oxytone) / -eis (paroxytone); -m → -ns; -r/-z → +es; -s → +es (monosyllable / oxytone:
 * mês → meses, inglês → ingleses) or invariable (lápis, vírus, férias); -x invariable.
 * Feminine: -o → -a, -or → -ora, -ês → -esa, -ão → -ã, -eu → -eia (+ exceptions); -e, -l, -z, -m, -ista,
 * comparatives in -or (melhor, maior …) are invariable.
 */

/** -ão nouns/adjectives with plural -ães. */
export const PLURAL_AES: ReadonlySet<string> = new Set([
  'pão', 'cão', 'alemão', 'capitão', 'capelão', 'charlatão', 'escrivão', 'sacristão', 'tabelião', 'catalão', 'maçapão',
])
/** -ão nouns/adjectives with plural -ãos (incl. unstressed -ão: órgão, sótão, bênção). */
export const PLURAL_AOS: ReadonlySet<string> = new Set([
  'mão', 'irmão', 'cidadão', 'cristão', 'pagão', 'chão', 'grão', 'vão', 'são', 'desvão', 'cortesão', 'acórdão',
  'órgão', 'órfão', 'sótão', 'bênção', 'zângão', 'concidadão',
])
/** Fully irregular plurals. */
export const PLURAL_IRREGULAR: Readonly<Record<string, string>> = {
  mal: 'males',
  cônsul: 'cônsules',
  carácter: 'caracteres',
  júnior: 'juniores',
  sénior: 'seniores',
  qualquer: 'quaisquer',
  cais: 'cais',
  ás: 'ases',
}

/** Irregular feminines (the entry's `fem` overrides). */
export const FEM_IRREGULAR: Readonly<Record<string, string>> = {
  mau: 'má',
  bom: 'boa',
  judeu: 'judia',
  réu: 'ré',
  herói: 'heroína',
  avô: 'avó',
  ator: 'atriz',
  imperador: 'imperatriz',
  ladrão: 'ladra',
  espanhol: 'espanhola',
  andaluz: 'andaluza',
  cru: 'crua',
  nu: 'nua',
  um: 'uma',
  algum: 'alguma',
  nenhum: 'nenhuma',
  meu: 'minha',
  teu: 'tua',
  seu: 'sua',
  ele: 'ela',
  este: 'esta',
  esse: 'essa',
  aquele: 'aquela',
  dois: 'duas',
  ambos: 'ambas',
  vários: 'várias',
  o: 'a',
  bretão: 'bretã',
}
/** -or words without a feminine form (comparatives, invariable adjectives). */
const OR_INVARIABLE = new Set(['melhor', 'pior', 'maior', 'menor', 'superior', 'inferior', 'anterior', 'posterior', 'interior', 'exterior', 'ulterior', 'multicolor', 'incolor'])

const ACCENTED = /[áéíóúâêôàãõ]/
const VOWELS = /[aeiouáéíóúâêôãõ]+/g

const syllables = (w: string) => (w.match(VOWELS) ?? []).length
/** Final syllable stressed (oxytone)? True if no written accent elsewhere, or the accent is in the last syllable. */
function oxytone(w: string, ending: number): boolean {
  const head = w.slice(0, -ending)
  return !ACCENTED.test(head)
}
const unaccent = (s: string) => s.replace(/[áâ]/g, 'a').replace(/[éê]/g, 'e').replace(/[óô]/g, 'o')

/** Plural of one word (no exceptions applied for compounds). */
function pluralWord(w: string): string[] {
  if (PLURAL_IRREGULAR[w]) return [PLURAL_IRREGULAR[w]]
  if (w.endsWith('ão')) {
    if (PLURAL_AES.has(w)) return [w.slice(0, -2) + 'ães']
    if (PLURAL_AOS.has(w)) return [w + 's']
    return [w.slice(0, -2) + 'ões']
  }
  if (/[aeiouáéíóúâêôãõ]$/.test(w)) return [w + 's']
  if (w.endsWith('l')) {
    const ox = oxytone(w, 2)
    const stem = w.slice(0, -2)
    if (w.endsWith('al')) return [stem + 'ais']
    if (w.endsWith('el')) return [stem + (ox ? 'éis' : 'eis')]
    if (w.endsWith('ol')) return [stem + (ox ? 'óis' : 'ois')]
    if (w.endsWith('ul')) return [stem + 'uis']
    if (w.endsWith('il')) return [ox ? stem + 'is' : stem + 'eis']
    return [w + 'es']
  }
  if (w.endsWith('m')) return [w.slice(0, -1) + 'ns']
  if (w.endsWith('n')) return [w + 's', w + 'es']
  if (/[rz]$/.test(w)) return [w + 'es']
  if (w.endsWith('s')) {
    const last = w.slice(-3)
    if (syllables(w) <= 1 || /[áéíóúâêô]/.test(last)) {
      // mês → meses, inglês → ingleses, gás → gases; país → países (hiatus í kept)
      const fixed = /[aeiou][íú]s$/.test(w) ? w : w.slice(0, -4) + unaccent(w.slice(-4))
      return [fixed + 'es']
    }
    return [w] // lápis, vírus, férias, ténis
  }
  if (w.endsWith('x')) return [w]
  return []
}

const PREPOSITIONS = new Set(['de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'a', 'à', 'ao', 'com', 'para', 'por', 'sem', 'sobre'])

/**
 * Plural candidates of a noun/adjective lemma (one word, hyphenated compound or multi-word):
 * segunda-feira → segundas-feiras; guarda-chuva → guarda-chuvas; casa de banho → casas de banho;
 * bilhete único → bilhetes únicos.
 */
export function plurals(lemma: string): string[] {
  const w = lemma.trim()
  if (w.includes(' ')) {
    const words = w.split(' ')
    const firstPrep = words.findIndex((x, i) => i > 0 && PREPOSITIONS.has(x))
    const head = firstPrep < 0 ? words.length : firstPrep
    const out = new Set<string>()
    const p0 = pluralWord(words[0])
    for (const p of p0) out.add([p, ...words.slice(1)].join(' '))
    if (head > 1) {
      const all = words.slice(0, head).map((x) => pluralWord(x)[0] ?? x)
      out.add([...all, ...words.slice(head)].join(' '))
    }
    return [...out]
  }
  if (w.includes('-')) {
    const parts = w.split('-')
    const out = new Set<string>()
    const pl = parts.map((x) => pluralWord(x)[0] ?? x)
    out.add(pl.join('-')) // segundas-feiras, pequenos-almoços
    out.add([...parts.slice(0, -1), pl[pl.length - 1]].join('-')) // guarda-chuvas
    out.add([pl[0], ...parts.slice(1)].join('-')) // pães-de-ló
    return [...out].filter((x) => x !== w)
  }
  return pluralWord(w).filter((x) => x !== w || w.endsWith('s') || w.endsWith('x'))
}

/** Feminine of a masculine noun/adjective, or null if invariable (alegre, fácil, feliz, melhor). */
export function feminine(lemma: string): string | null {
  const w = lemma.trim()
  if (w.includes(' ')) {
    // first word agrees: farto de → farta de; médico de família → médica de família
    const [first, ...rest] = w.split(' ')
    const f = feminine(first)
    return f ? [f, ...rest].join(' ') : null
  }
  if (FEM_IRREGULAR[w]) return FEM_IRREGULAR[w]
  if (w.endsWith('ão')) return w.slice(0, -2) + 'ã'
  if (w.endsWith('ês')) return w.slice(0, -2) + 'esa'
  if (w.endsWith('or')) return OR_INVARIABLE.has(w) ? null : w + 'a'
  if (w.endsWith('eu')) return w.slice(0, -2) + 'eia'
  if (w.endsWith('o')) return w.slice(0, -1) + 'a'
  return null
}
