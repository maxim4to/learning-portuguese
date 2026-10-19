/**
 * Lexicon lookup: tapped/selected pt form → candidate lemmas with Russian meanings.
 *
 *   const lex = await loadLexicon()          // lazy chunk, memoised; works offline (precached JS)
 *   lex.resolve('levanto-me')               // → [{ entry: levantar-se, via: 'clitic', clitics: ['me'] …}]
 *   lex.search('pequeno')                   // manual search (pt prefix, accent-insensitive, or ru)
 *
 * `createLexicon(bundle)` builds the same object synchronously (Node scripts and tests).
 */
import type { Level } from '../../content/schema.ts'
import { analyzeForm, foldDiacritics, normalizeForm, reflexiveLemma, type FormAnalysis } from './normalize.ts'
import {
  LEX_FLAG,
  type LexCandidate,
  type LexEntry,
  type LexiconBundle,
  type LookupContext,
  type MweMatch,
} from './types.ts'

export type * from './types.ts'

const LEVEL_RANK: Record<Level, number> = { A1: 0, A2: 1, B1: 2, B2: 3 }
const VIA_RANK: Record<LexCandidate['via'], number> = { exact: 0, article: 0, clitic: 1, contraction: 2 }

/** After these words a noun/adjective is expected (articles, prepositions, contractions, possessives). */
const NOMINAL_CONTEXT = new Set(
  'o a os as um uma uns umas de do da dos das em no na nos nas ao aos à às pelo pela pelos pelas num numa com para por sem meu minha meus minhas teu tua seu sua nosso nossa este esta esse essa aquele aquela muito muita pouco pouca'.split(
    ' ',
  ),
)
/** After these words a verb is expected. */
const VERBAL_CONTEXT = new Set('eu tu ele ela nós vós eles elas você vocês não se me te lhe já também nunca'.split(' '))

export interface Lexicon {
  readonly size: { entries: number; forms: number }
  /** Content hash of the build inputs. */
  readonly hash: string
  /** Candidates for one tapped word or a selection (best first). Empty array = not in the lexicon. */
  resolve(form: string, ctx?: LookupContext): LexCandidate[]
  /** Longest multi-word lemma around token `i` (e.g. «de vez em quando», «casa de banho»). */
  matchMwe(tokens: readonly string[], i: number): MweMatch | null
  /** Manual search for the «найти слово» dialog: pt (prefix, accent-insensitive) or ru substring. */
  search(query: string, limit?: number): LexEntry[]
  entryById(id: string): LexEntry | undefined
  entryAt(index: number): LexEntry | undefined
  /** Theme keys of a lemma: ['vocab:saude', 'situation:centro-de-saude']. */
  themesOf(id: string): string[]
  /** Lemmas of a theme key (vocab theme / situation / reading text). */
  entriesOfTheme(themeKey: string): LexEntry[]
}

export function createLexicon(bundle: LexiconBundle): Lexicon {
  if (bundle.v !== 1) throw new Error(`Unsupported lexicon bundle version ${String(bundle.v)}`)

  const themesByEntry = new Map<number, string[]>()
  for (const [key, idxs] of Object.entries(bundle.themes)) {
    for (const i of idxs) {
      const list = themesByEntry.get(i)
      if (list) list.push(key)
      else themesByEntry.set(i, [key])
    }
  }

  const entries: LexEntry[] = bundle.entries.map(([id, lemma, pos, ru, gender, level, flags], index) => ({
    index,
    id,
    lemma,
    pos,
    ru: ru.split('; '),
    gender: gender || undefined,
    level: level || undefined,
    reflexive: (flags & LEX_FLAG.reflexive) !== 0,
    multiword: (flags & LEX_FLAG.multiword) !== 0,
    themes: themesByEntry.get(index) ?? [],
  }))
  const byId = new Map(entries.map((e) => [e.id, e]))

  const forms = new Map<string, [number, string][]>(Object.entries(bundle.forms))
  /** folded key → original keys (accent-insensitive fallback) */
  const folded = new Map<string, string[]>()
  /** multi-word keys, for matchMwe */
  let mweMaxLen = 1
  for (const key of forms.keys()) {
    const f = foldDiacritics(key)
    const list = folded.get(f)
    if (list) list.push(key)
    else folded.set(f, [key])
    if (key.includes(' ')) mweMaxLen = Math.max(mweMaxLen, key.split(' ').length)
  }

  /** Lemma-tagged hits only: normalised lemma → entries */
  const lemmaHits = (key: string): LexEntry[] =>
    (forms.get(key) ?? []).filter(([, tag]) => tag === '').map(([i]) => entries[i])

  function hitsFor(a: FormAnalysis, key: string, approximate: boolean, form: string, out: LexCandidate[]) {
    const base = {
      form,
      via: a.via,
      article: a.article,
      contraction: a.contraction,
      clitics: a.clitics,
      mesoclitic: a.mesoclitic,
      approximate,
    }
    const hits = forms.get(key) ?? []
    for (const [i, tag] of hits) {
      const entry = entries[i]
      // levanto-me: offer «levantar-se» before «levantar»
      if (a.reflexive && entry.pos === 'verb' && !entry.reflexive) {
        const r = reflexiveLemma(entry.lemma)
        if (r) for (const re of lemmaHits(r)) out.push({ ...base, entry: re, matched: key, tag })
      }
      out.push({ ...base, entry, matched: key, tag })
    }
    // Only the reflexive lemma exists: «levantar» / «levantar-me» → levantar-se
    if (!hits.length && (a.reflexive || a.via === 'exact')) {
      const r = reflexiveLemma(key)
      if (r) for (const re of lemmaHits(r)) out.push({ ...base, entry: re, matched: r, tag: '' })
    }
  }

  function score(c: LexCandidate, ctx: LookupContext | undefined, singleWord: boolean): number {
    let s = VIA_RANK[c.via]
    if (c.via === 'clitic' && c.entry.reflexive) s -= 0.5
    if (c.approximate) s += 4
    if (c.tag !== '') s += 0.2 // the lemma itself before an inflected form of another lemma
    if (singleWord && c.entry.pos === 'phrase') s += 1.5
    if (c.via === 'contraction' && c.contraction && c.matched === c.contraction.rest) s += 0.5
    if (ctx?.prev) {
      const prev = normalizeForm(ctx.prev)
      if (NOMINAL_CONTEXT.has(prev) && (c.entry.pos === 'noun' || c.entry.pos === 'adj')) s -= 0.6
      if (VERBAL_CONTEXT.has(prev) && c.entry.pos === 'verb') s -= 0.6
    }
    s += c.entry.level ? LEVEL_RANK[c.entry.level] * 0.1 : 0.45
    return s
  }

  function resolve(raw: string, ctx?: LookupContext): LexCandidate[] {
    const form = normalizeForm(raw)
    if (!form) return []
    const analyses = analyzeForm(form)
    let found: LexCandidate[] = []
    for (const a of analyses) hitsFor(a, a.key, false, form, found)
    if (!found.length) {
      // Accent-insensitive fallback: «voce» → «você», «acucar» → «açúcar»
      for (const a of analyses) {
        for (const key of folded.get(foldDiacritics(a.key)) ?? []) hitsFor(a, key, true, form, found)
      }
    }
    const single = !form.includes(' ')
    const scored = found.map((c, order) => ({ c, s: score(c, ctx, single), order }))
    scored.sort((x, y) => x.s - y.s || x.order - y.order)
    const seen = new Set<number>()
    found = []
    for (const { c } of scored) {
      if (seen.has(c.entry.index)) continue
      seen.add(c.entry.index)
      found.push(c)
    }
    return found
  }

  function matchMwe(tokens: readonly string[], i: number): MweMatch | null {
    if (i < 0 || i >= tokens.length || mweMaxLen < 2) return null
    const norm = tokens.map((t) => normalizeForm(t))
    for (let len = Math.min(mweMaxLen, tokens.length); len >= 2; len--) {
      for (let start = Math.max(0, i - len + 1); start <= i && start + len <= tokens.length; start++) {
        const key = norm.slice(start, start + len).join(' ')
        const hits = forms.get(key)
        if (hits?.length) {
          const list = [...new Set(hits.map(([idx]) => idx))].map((idx) => entries[idx]).filter((e) => e.multiword)
          if (list.length) return { start, end: start + len, entries: list }
        }
      }
    }
    return null
  }

  const searchIndex = entries.map((e) => ({
    e,
    pt: foldDiacritics(normalizeForm(e.lemma)),
    ru: e.ru.join(' ; ').toLocaleLowerCase('ru').replace(/ё/g, 'е'),
  }))

  function search(query: string, limit = 20): LexEntry[] {
    const q = query.trim()
    if (!q) return []
    const out: LexEntry[] = []
    const seen = new Set<number>()
    const push = (e: LexEntry) => {
      if (!seen.has(e.index)) {
        seen.add(e.index)
        out.push(e)
      }
    }
    if (/\p{Script=Cyrillic}/u.test(q)) {
      const rq = q.toLocaleLowerCase('ru').replace(/ё/g, 'е')
      const hits = searchIndex.filter((x) => x.ru.includes(rq))
      // whole-meaning match first, then word-prefix, then substring
      const rank = (x: (typeof searchIndex)[number]) =>
        x.e.ru.some((m) => m.toLocaleLowerCase('ru').replace(/ё/g, 'е') === rq)
          ? 0
          : new RegExp(`(^|[^\\p{L}])${rq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(x.ru)
            ? 1
            : 2
      hits
        .map((x) => ({ x, r: rank(x) }))
        .sort((a, b) => a.r - b.r || entryOrder(a.x.e, b.x.e))
        .forEach(({ x }) => push(x.e))
      return out.slice(0, limit)
    }
    for (const c of resolve(q)) push(c.entry)
    const fq = foldDiacritics(normalizeForm(q))
    if (!fq) return out.slice(0, limit)
    const prefix: LexEntry[] = []
    const wordPrefix: LexEntry[] = []
    const inner: LexEntry[] = []
    for (const x of searchIndex) {
      if (x.pt.startsWith(fq)) prefix.push(x.e)
      else if (x.pt.includes(' ' + fq) || x.pt.includes('-' + fq)) wordPrefix.push(x.e)
      else if (fq.length >= 3 && x.pt.includes(fq)) inner.push(x.e)
    }
    for (const list of [prefix, wordPrefix, inner]) list.sort(entryOrder).forEach(push)
    return out.slice(0, limit)
  }

  return {
    size: { entries: entries.length, forms: forms.size },
    hash: bundle.hash,
    resolve,
    matchMwe,
    search,
    entryById: (id) => byId.get(id),
    entryAt: (index) => entries[index],
    themesOf: (id) => byId.get(id)?.themes ?? [],
    entriesOfTheme: (key) => (bundle.themes[key] ?? []).map((i) => entries[i]),
  }
}

/** Single words before expressions, shorter lemmas first, then alphabetical. */
function entryOrder(a: LexEntry, b: LexEntry): number {
  return (
    Number(a.pos === 'phrase') - Number(b.pos === 'phrase') ||
    a.lemma.length - b.lemma.length ||
    a.lemma.localeCompare(b.lemma, 'pt')
  )
}

// ---------------------------------------------------------------------------
// Lazy loading (app): the bundle is a separate JS chunk, precached by the service worker.
// ---------------------------------------------------------------------------

let loading: Promise<Lexicon> | null = null
let loaded: Lexicon | null = null

/** Loads the lexicon chunk once (dynamic import) and memoises it. Retries after a failed load. */
export function loadLexicon(): Promise<Lexicon> {
  loading ??= import('../../generated/lexicon.json')
    .then((m) => {
      loaded = createLexicon(m.default as unknown as LexiconBundle)
      return loaded
    })
    .catch((err: unknown) => {
      loading = null
      throw err
    })
  return loading
}

/** The lexicon if it has already been loaded, else null (render a skeleton and await `loadLexicon()`). */
export function getLoadedLexicon(): Lexicon | null {
  return loaded
}

/** Fire-and-forget warm-up, e.g. on idle or on the first pointerdown over pt text. */
export function preloadLexicon(): void {
  loadLexicon().catch(() => {})
}
