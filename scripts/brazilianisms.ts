/** Brazilianism linter rules (used by scripts/validate.ts, tested in scripts/brazilianisms.test.ts). */

export interface Rule {
  re: RegExp
  msg: string
}

const L = '\\p{L}'
/** Whole-word match (Unicode-aware boundaries: no letter directly before/after). */
const word = (w: string) => new RegExp(`(?<!${L})(?:${w})(?!${L})`, 'iu')

const ESTAR_FORMS =
  'estar|estou|estás|está|estamos|estais|estão|estava|estavas|estávamos|estavam|estive|estiveste|esteve|estivemos|estiveram|estarei|estará|estaremos|estarão|estaria|estariam|esteja|estejam|estivesse|estivessem|estiver|estiverem|estando'
// -ndo words that are not gerunds
const NOT_GERUND = new Set(['lindo', 'quando', 'bando', 'comando', 'brando', 'infindo', 'findo', 'mundo', 'segundo', 'fundo', 'redondo', 'hediondo', 'oriundo'])

/**
 * «a gente» is a Brazilianism only as a pronoun («a gente vai»). After a determiner/quantifier
 * («toda a gente», «muita gente», «esta gente»…) it is the noun «gente» = people and fine in pt-PT.
 * Forms without the article («muita gente», «há gente») never match because «a» must be a whole word.
 */
const GENTE_DETERMINERS = 'toda|muita|pouca|tanta|alguma|nenhuma|esta|essa|aquela|outra|boa|má|que'
const A_GENTE = new RegExp(`(?<!${L})(?<!(?<!${L})(?:${GENTE_DETERMINERS})\\s+)a\\s+gente(?!${L})`, 'iu')

export const RULES: Rule[] = [
  { re: word('ônibus'), msg: '«ônibus» → pt-PT «autocarro»' },
  { re: word('trem'), msg: '«trem» → pt-PT «comboio»' },
  { re: word('celular(es)?'), msg: '«celular» → pt-PT «telemóvel»' },
  { re: word('banheiros?'), msg: '«banheiro» → pt-PT «casa de banho»' },
  { re: word('café\\s+da\\s+manhã'), msg: '«café da manhã» → pt-PT «pequeno-almoço»' },
  { re: A_GENTE, msg: '«a gente» → pt-PT предпочтительно «nós»' },
  { re: word('geladeiras?'), msg: '«geladeira» → pt-PT «frigorífico»' },
  { re: word('xícaras?'), msg: '«xícara» → pt-PT «chávena»' },
  { re: word('sorvetes?'), msg: '«sorvete» → pt-PT «gelado»' },
  { re: word('usuári[oa]s?'), msg: '«usuário» → pt-PT «utilizador»' },
  { re: word('metrô'), msg: '«metrô» → pt-PT «metro»' },
  {
    // Only the exclamative/adjectival «cool» sense: «que legal», «é legal», «muito legal», «Legal!».
    // Not the pt-PT «lawful» sense after a noun («assistência legal», «idade legal»).
    re: new RegExp(`(?<!${L})(?:muito|tá|está|que|tudo|é|bem|super)\\s+legal(?!${L})|(?:^|[.!?]\\s*)legal\\s*[!.]`, 'iu'),
    msg: '«legal» в значении «классно» — бразилизм (pt-PT: «fixe», «giro»)',
  },
]

export function lintGerund(text: string): string | null {
  const re = new RegExp(`(?<!${L})(?:${ESTAR_FORMS})\\s+(${L}+(?:ando|endo|indo))(?!${L})`, 'giu')
  for (const m of text.matchAll(re)) {
    if (!NOT_GERUND.has(m[1].toLowerCase())) return `estar + герундий («${m[0]}») → pt-PT «estar a + infinitivo»`
  }
  return null
}

/** All Brazilianism findings for one Portuguese string. */
export function lintText(text: string): string[] {
  const problems = RULES.filter((r) => r.re.test(text)).map((r) => r.msg)
  const g = lintGerund(text)
  if (g) problems.push(g)
  return problems
}
