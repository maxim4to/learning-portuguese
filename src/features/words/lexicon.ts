/**
 * UI glue between the lazy lexicon (src/engine/lexicon/lookup.ts) and the personal dictionary:
 * `useLexicon()` loads the chunk once; `contentWordInput()` turns a content word (vocab theme,
 * situation vocab) into a `NewWordInput` with its lexicon id; `lexEntryInput()` does the same for a
 * search hit.
 */
import { useEffect, useState } from 'react'
import type { Level } from '@/content'
import type { WordPos } from '@/data'
import { getLoadedLexicon, loadLexicon, type LexEntry, type Lexicon } from '@/engine/lexicon/lookup'
import { normalizeLemma, type NewWordInput } from './wordOps.ts'

export interface LexiconState {
  lex: Lexicon | null
  status: 'loading' | 'ready' | 'error'
}

/** The lexicon (null while the chunk loads or if it failed — then fall back to manual input). */
export function useLexicon(): LexiconState {
  const [state, setState] = useState<LexiconState>(() => {
    const lex = getLoadedLexicon()
    return { lex, status: lex ? 'ready' : 'loading' }
  })
  useEffect(() => {
    if (state.lex) return
    let alive = true
    loadLexicon()
      .then((lex) => alive && setState({ lex, status: 'ready' }))
      .catch(() => alive && setState({ lex: null, status: 'error' }))
    return () => {
      alive = false
    }
  }, [state.lex])
  return state
}

/** Part of speech: full Russian name (for chips and the word page). */
export const POS_LABEL: Record<WordPos, string> = {
  noun: 'существительное',
  verb: 'глагол',
  adj: 'прилагательное',
  adv: 'наречие',
  prep: 'предлог',
  pron: 'местоимение',
  det: 'определитель',
  conj: 'союз',
  num: 'числительное',
  interj: 'междометие',
  phrase: 'выражение',
  other: 'другое',
}

/** Short part-of-speech tag for dense rows. */
export const POS_SHORT_LABEL: Record<WordPos, string> = {
  noun: 'сущ.',
  verb: 'глаг.',
  adj: 'прил.',
  adv: 'нареч.',
  prep: 'предл.',
  pron: 'мест.',
  det: 'опред.',
  conj: 'союз',
  num: 'числ.',
  interj: 'межд.',
  phrase: 'выраж.',
  other: '',
}

export const GENDER_LABEL: Record<'m' | 'f' | 'mf', string> = {
  m: 'мужской род (o)',
  f: 'женский род (a)',
  mf: 'оба рода (o/a)',
}

const ARTICLE_RE = /^(?:o\/a|a\/o|os\/as|o|a|os|as|um|uma)\s+/i

/** «a saúde» → «saúde», «o/a utente» → «utente», «o currículo (CV)» → «currículo». */
export function bareLemma(pt: string): string {
  return pt
    .replace(/\s*\([^)]*\)/g, '')
    .trim()
    .replace(ARTICLE_RE, '')
    .trim()
}

/** A content word as shown in a theme / situation. */
export interface ContentWord {
  pt: string
  ru: string
  gender?: 'm' | 'f' | 'mf'
  example?: string
}

/**
 * Lexicon entry of a content word: a candidate that belongs to the same theme first, then any lemma
 * of that theme with the same bare form, then an exact (non-approximate) hit anywhere.
 */
export function matchContentWord(lex: Lexicon, word: ContentWord, themeKey: string): LexEntry | undefined {
  const bare = bareLemma(word.pt)
  const cands = [...lex.resolve(word.pt), ...lex.resolve(bare)].filter((c) => !c.approximate)
  const inTheme = cands.find((c) => c.entry.themes.includes(themeKey))
  if (inTheme) return inTheme.entry
  const key = normalizeLemma(bare)
  const byLemma = lex.entriesOfTheme(themeKey).find((e) => normalizeLemma(e.lemma) === key)
  if (byLemma) return byLemma
  return cands.find((c) => normalizeLemma(c.entry.lemma) === key)?.entry
}

/**
 * Input for saving a content word: lexicon id/lemma/pos when found, the content's own translation
 * (context first) and gender, the theme as source. Without the lexicon the word is saved as `u:<lemma>`.
 */
export function contentWordInput(
  lex: Lexicon | null,
  word: ContentWord,
  opts: { themeKey: string; src: string; level?: Level },
): NewWordInput {
  const entry = lex ? matchContentWord(lex, word, opts.themeKey) : undefined
  const lemma = entry?.lemma ?? bareLemma(word.pt)
  const gender = word.gender ?? entry?.gender
  const pos: WordPos | undefined = entry?.pos ?? (gender || ARTICLE_RE.test(word.pt) ? 'noun' : undefined)
  return {
    lexId: entry?.id,
    lemma,
    ru: word.ru,
    pos,
    gender: pos === 'noun' ? (gender ?? articleGender(word.pt)) : gender,
    level: entry?.level ?? opts.level,
    source: { src: opts.src, form: lemma, sentence: word.example },
  }
}

function articleGender(pt: string): 'm' | 'f' | 'mf' | undefined {
  const m = ARTICLE_RE.exec(pt.trim())
  if (!m) return undefined
  const a = m[0].trim().toLowerCase()
  if (a.includes('/')) return 'mf'
  return a === 'a' || a === 'as' || a === 'uma' ? 'f' : 'm'
}

/** Input for a lexicon search hit (all meanings; source «добавлено вручную»). */
export function lexEntryInput(entry: LexEntry, ru?: string): NewWordInput {
  return {
    lexId: entry.id,
    lemma: entry.lemma,
    ru: ru ?? entry.ru,
    pos: entry.pos,
    gender: entry.gender,
    level: entry.level,
    source: { src: 'manual', form: entry.lemma },
  }
}
