/**
 * Answer checking for typed exercises.
 *
 * normalize(): NFC, trim, lowercase, unify apostrophes/quotes/dashes, drop sentence
 * punctuation (. , ! ? ; : … « » quotes ¿ ¡), collapse whitespace. Accents are KEPT.
 * Hyphens inside words are kept (clitics matter: "chama-se").
 */

const APOSTROPHES = /[’‘‛`´ʼ′]/g
const QUOTES = /[“”„‟«»"″]/g
const DASHES = /[‐‑‒–—―]/g
const PUNCT = /[.,!?;:…¿¡"()]/g
/**
 * What may follow a clitic hyphen typed with spaces («chama - se», «dir - lhe - ei»): pronouns and the
 * futuro/condicional endings after a mesoclitic. Any other word after a spaced dash means the dash is a pause.
 */
const AFTER_HYPHEN = new Set(
  'me te se nos vos lhe lhes o a os as lo la los las no na nas mo ma mos mas to ta tos tas lho lha lhos lhas ei ás á emos eis ão ia ias íamos íeis iam'.split(
    ' ',
  ),
)

export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .replace(APOSTROPHES, "'")
    .replace(QUOTES, '"')
    .replace(DASHES, '-')
    .toLocaleLowerCase('pt-PT')
    .replace(PUNCT, ' ')
    // a dash with spaces on both sides is a pause («Olá — tudo bem?») unless a clitic follows («chama - se»)
    .replace(/(\S)\s+-\s+(?=(\p{L}+))/gu, (_m, prev: string, next: string) => (AFTER_HYPHEN.has(next) ? `${prev}-` : `${prev} `))
    .replace(/^\s*-+\s*|\s*-+\s*$/g, '') // dialogue dash at the start / a trailing dash
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Removes diacritics (after normalize). "está" → "esta", "ção" → "cao". */
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC')
}

/** Equal after normalize() and ignoring accents. */
export function looseMatch(a: string, b: string): boolean {
  return stripAccents(normalize(a)) === stripAccents(normalize(b))
}

export type GradeVerdict = 'correct' | 'accents' | 'wrong'

export interface GradeResult {
  /** Strict match (after normalize, accents significant). */
  correct: boolean
  /** The accepted variant closest to what was typed (original spelling, for display). */
  closest: string
  /** true when the only difference is accents → show «правильно, но проверь акценты». */
  accentsOnly: boolean
  /** 'correct' | 'accents' (accent-only mismatch) | 'wrong'. UI decides whether 'accents' counts. */
  verdict: GradeVerdict
  /** Levenshtein distance from normalized `given` to normalized `closest`. */
  distance: number
}

export function gradeAnswer(given: string, accepted: readonly string[]): GradeResult {
  if (accepted.length === 0) throw new Error('gradeAnswer: accepted list is empty')
  const g = normalize(given)
  let best = accepted[0]
  let bestDist = Infinity
  for (const a of accepted) {
    const na = normalize(a)
    if (na === g) return { correct: true, closest: a, accentsOnly: false, verdict: 'correct', distance: 0 }
    const d = levenshtein(g, na)
    if (d < bestDist) {
      bestDist = d
      best = a
    }
  }
  const accentHit = accepted.find((a) => looseMatch(given, a))
  if (accentHit !== undefined) {
    return {
      correct: false,
      closest: accentHit,
      accentsOnly: true,
      verdict: 'accents',
      distance: levenshtein(g, normalize(accentHit)),
    }
  }
  return { correct: false, closest: best, accentsOnly: false, verdict: 'wrong', distance: bestDist }
}

/** Classic Levenshtein distance (by code points). */
export function levenshtein(a: string, b: string): number {
  const s = [...a]
  const t = [...b]
  if (!s.length) return t.length
  if (!t.length) return s.length
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i)
  for (let i = 1; i <= s.length; i++) {
    const cur = [i]
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[t.length]
}
