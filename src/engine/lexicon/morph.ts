/**
 * Morphological tags of the lexicon bundle → labels for the lookup card.
 *
 *   morphLabel('PI1s')            → 'presente do indicativo (eu)'
 *   morphLabel('PC1s,PC3s,IMP3s') → 'presente do conjuntivo (eu, ele/ela); imperativo (você)'
 *   morphLabel('FPL')             → 'ж. р., мн. ч.'
 *   morphHint('PPS1p')            → 'прошедшее совершённое время'
 *
 * Tag grammar: see ./endings.ts. Pure module (no DOM), shared with scripts.
 */
import { PERSONS, TENSES, type Person, type Tense } from './endings.ts'

export const TENSE_LABEL: Readonly<Record<Tense, string>> = {
  PI: 'presente do indicativo',
  PPS: 'pretérito perfeito',
  II: 'pretérito imperfeito',
  MQP: 'mais-que-perfeito',
  FI: 'futuro',
  CD: 'condicional',
  PC: 'presente do conjuntivo',
  IC: 'imperfeito do conjuntivo',
  FC: 'futuro do conjuntivo',
  IMP: 'imperativo',
  INFP: 'infinitivo pessoal',
}

/** Russian gloss of a tense (tooltip / screen readers). */
export const TENSE_RU: Readonly<Record<Tense, string>> = {
  PI: 'настоящее время',
  PPS: 'прошедшее совершённое время',
  II: 'прошедшее несовершённое время',
  MQP: 'давнопрошедшее время',
  FI: 'будущее время',
  CD: 'условное наклонение',
  PC: 'сослагательное наклонение, настоящее',
  IC: 'сослагательное наклонение, прошедшее',
  FC: 'сослагательное наклонение, будущее',
  IMP: 'повелительное наклонение',
  INFP: 'личный инфинитив',
}

const PRONOUN: Readonly<Record<Person, string>> = { '1s': 'eu', '2s': 'tu', '3s': 'ele/ela', '1p': 'nós', '2p': 'vós', '3p': 'eles/elas' }
/** Imperative 3rd persons address «você / vocês» (o senhor / a senhora). */
const IMP_PRONOUN: Readonly<Record<Person, string>> = { ...PRONOUN, '3s': 'você', '3p': 'vocês' }

export const PERSON_RU: Readonly<Record<Person, string>> = {
  '1s': '1 л. ед. ч.',
  '2s': '2 л. ед. ч.',
  '3s': '3 л. ед. ч.',
  '1p': '1 л. мн. ч.',
  '2p': '2 л. мн. ч.',
  '3p': '3 л. мн. ч.',
}

/** Labels of non-finite and nominal tags ('' = no label). */
export const SIMPLE_LABEL: Readonly<Record<string, string>> = {
  '': '',
  X: '',
  GER: 'gerúndio',
  PP: 'particípio',
  PPF: 'particípio, ж. р.',
  PPPL: 'particípio, мн. ч.',
  PPFPL: 'particípio, ж. р., мн. ч.',
  PL: 'мн. ч.',
  F: 'ж. р.',
  FPL: 'ж. р., мн. ч.',
  DIM: 'уменьшительная форма',
  SUP: 'превосходная степень',
  ADV: 'наречие',
  BR: 'бразильский вариант',
  COL: 'разг. форма',
}

const SIMPLE_RU: Readonly<Record<string, string>> = {
  COL: 'разговорная усечённая форма (tá = está)',
  GER: 'деепричастие (в pt-PT обычно estar a + инфинитив)',
  PP: 'причастие прошедшего времени',
  PPF: 'причастие, женский род',
  PPPL: 'причастие, множественное число',
  PPFPL: 'причастие, женский род, множественное число',
}

export interface MorphFeature {
  /** Raw code: 'PI1s', 'GER', 'PL'. */
  code: string
  tense?: Tense
  person?: Person
}

const TENSE_RE = new RegExp(`^(${[...TENSES].sort((a, b) => b.length - a.length).join('|')})(${PERSONS.join('|')})$`)

/** 'PC1s,IMP3s' → [{ code: 'PC1s', tense: 'PC', person: '1s' }, …]. Unknown codes are kept as is. */
export function parseTags(tag: string): MorphFeature[] {
  if (!tag) return []
  return tag.split(',').map((code) => {
    const m = TENSE_RE.exec(code)
    return m ? { code, tense: m[1] as Tense, person: m[2] as Person } : { code }
  })
}

/** Is this a verb-form tag (finite, gerúndio or particípio)? */
export function isVerbTag(tag: string): boolean {
  return parseTags(tag).some((f) => f.tense || f.code === 'GER' || f.code.startsWith('PP'))
}

/** Short label for the lookup card ('' for the lemma itself or an unanalysed explicit form). */
export function morphLabel(tag: string): string {
  const feats = parseTags(tag)
  const byTense = new Map<Tense, Person[]>()
  const simple: string[] = []
  for (const f of feats) {
    if (f.tense && f.person) {
      const list = byTense.get(f.tense)
      if (list) list.push(f.person)
      else byTense.set(f.tense, [f.person])
    } else {
      const l = SIMPLE_LABEL[f.code]
      if (l && !simple.includes(l)) simple.push(l)
    }
  }
  const parts: string[] = []
  for (const t of TENSES) {
    const persons = byTense.get(t)
    if (!persons) continue
    const pron = t === 'IMP' ? IMP_PRONOUN : PRONOUN
    parts.push(`${TENSE_LABEL[t]} (${PERSONS.filter((p) => persons.includes(p)).map((p) => pron[p]).join(', ')})`)
  }
  return [...parts, ...simple].join('; ')
}

/** Russian explanation of the tag (title / aria-description). */
export function morphHint(tag: string): string {
  const out: string[] = []
  for (const f of parseTags(tag)) {
    const s = f.tense && f.person ? `${TENSE_RU[f.tense]}, ${PERSON_RU[f.person]}` : (SIMPLE_RU[f.code] ?? SIMPLE_LABEL[f.code] ?? '')
    if (s && !out.includes(s)) out.push(s)
  }
  return out.join('; ')
}
