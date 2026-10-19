/**
 * npm run lexicon [-- <cmd>]        (no command = build + extract + report)
 *
 *   build    content/lexicon/*.json → src/generated/lexicon.json (runtime bundle, committed). Every lemma is
 *            expanded through the morphology (src/engine/lexicon/{conjugate,irregular}.ts, scripts/lexicon/inflect.ts); forms that occur
 *            in the course corpus are indexed with morph tags. Checks: schema, duplicates, `conj`, placement,
 *            Brazilianisms, size (> 1 MB raw = error).
 *   extract  Tokenise the whole course (dialogues, phrases, readings, examples, exercises + pt fragments of theory
 *            and cheat-sheets) and write content/lexicon/_todo.json: every form not resolved by lexicon+morphology,
 *            grouped by suggested lemma, with frequency, contexts, part of speech and the slice that owns it.
 *   report   Coverage by unique forms and tokens, ambiguity, top missing forms, todo per slice.
 *   todo <slice> [--limit N]   Compact todo list of one slice (a-c, d-l …) for a content agent.
 *   format   Sort entries and move each one to its canonical file (scripts/lexicon/layout.ts). Orchestrator only.
 *   seed [--force]   Import lemmas from content (vocab, situations, glossaries) — phase 1, kept for re-runs.
 *
 * Content is written by people/agents in-session — never generated through an API (project rule).
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import {
  LexiconFileSchema,
  ReadingTextSchema,
  SituationSchema,
  VocabThemeSchema,
  lexEntryId,
  type Level,
  type LexEntrySource,
  type LexPosValue,
} from '../src/content/schema.ts'
import { guessLemmas, type Guess } from '../src/engine/lexicon/guess.ts'
import { createLexicon, type Lexicon } from '../src/engine/lexicon/lookup.ts'
import { normalizeForm, splitClitics, startsWithPrepositionA, tokenize } from '../src/engine/lexicon/normalize.ts'
import { LEX_FLAG, type LexEntryTuple, type LexiconBundle } from '../src/engine/lexicon/types.ts'
import { lintText } from './brazilianisms.ts'
import { conjugate, isValidConj, paradigmForms, verbForms } from '../src/engine/lexicon/conjugate.ts'
import { FEM_IRREGULAR, feminine, plurals } from './lexicon/inflect.ts'
import { SLICES, allFiles, fileFor, isPlacedOk, sliceOf } from './lexicon/layout.ts'
import { GLOSSARY, POS, SLASH, type SeedSpec } from './lexicon/seed-data.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const contentDir = join(root, 'content')
const lexiconDir = join(contentDir, 'lexicon')
const cheatsheetDir = join(contentDir, 'cheatsheets')
const bundlePath = join(root, 'src', 'generated', 'lexicon.json')
const todoPath = join(lexiconDir, '_todo.json')
const ignorePath = join(lexiconDir, '_ignore.json')

/** Raw bundle limit (docs/personal-dictionary.md §2.5) and the gzip budget of the lazy chunk. */
export const BUNDLE_MAX_BYTES = 1024 * 1024
export const BUNDLE_MAX_GZIP = 250 * 1024

const LEVEL_ORDER: Level[] = ['A1', 'A2', 'B1', 'B2']
const minLevel = (a?: Level, b?: Level): Level | undefined =>
  !a ? b : !b ? a : LEVEL_ORDER.indexOf(a) <= LEVEL_ORDER.indexOf(b) ? a : b

// ---------------------------------------------------------------------------
// Content loading
// ---------------------------------------------------------------------------

function walk(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const p = join(dir, name)
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : []
    })
}

/** content/**.json except content/lexicon → { '/content/…': parsed } */
export function loadContentFiles(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const abs of walk(contentDir)) {
    if (abs.startsWith(lexiconDir)) continue
    out['/' + relative(root, abs).split('\\').join('/')] = JSON.parse(readFileSync(abs, 'utf8'))
  }
  return out
}

/** Cheat-sheets that contain Portuguese examples (pt-PT vs pt-BR is skipped: it lists Brazilian forms on purpose). */
export function loadCheatsheets(): Record<string, string> {
  const out: Record<string, string> = {}
  if (!existsSync(cheatsheetDir)) return out
  for (const n of readdirSync(cheatsheetDir).sort()) {
    if (!n.endsWith('.md') || n.includes('pt-br')) continue
    out[`/content/cheatsheets/${n}`] = readFileSync(join(cheatsheetDir, n), 'utf8')
  }
  return out
}

// ---------------------------------------------------------------------------
// Seed: content item → lemma(s)
// ---------------------------------------------------------------------------

export interface SeedEntry {
  lemma: string
  pos: LexPosValue
  ru: string[]
  gender?: 'm' | 'f' | 'mf'
  fem?: string
  forms: string[]
  level?: Level
  /** Theme keys: vocab:<id>, situation:<id>, reading:<id> */
  refs: string[]
}

const ARTICLE_RE = /^(o|a|os|as)\s+(.+)$/i
const INFINITIVE_RE = /^(ir|\p{L}+(?:ar|er|ir)|p[ôo]r|\p{L}+por)(?:-se)?$/u
const PREP_FIRST = new Set(['ao', 'aos', 'à', 'às', 'em', 'de', 'do', 'da', 'com', 'sem', 'até', 'por', 'para', 'dentro', 'perto', 'no', 'na', 'a'])

const splitRu = (ru: string) =>
  ru
    .split(/;\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

/** Is «b» the feminine counterpart of «a» (single word or first word of an expression)? */
function isFemPair(a: string, b: string): boolean {
  if (a === b) return true
  const [a0, ...ar] = a.split(' ')
  const [b0, ...br] = b.split(' ')
  return ar.join(' ') === br.join(' ') && feminine(a0) === b0
}

function guessPos(lemma: string): LexPosValue {
  const n = normalizeForm(lemma)
  if (POS[n]) return POS[n]
  if (/[!?.…]$/.test(lemma.trim()) || /^\p{Lu}\p{Ll}/u.test(lemma)) return 'phrase'
  const words = n.split(' ')
  const first = words[0] === 'não' && words.length > 1 ? words[1] : words[0]
  if (INFINITIVE_RE.test(first)) return 'verb'
  if (words.length === 1) return n.endsWith('mente') ? 'adv' : 'adj'
  if (PREP_FIRST.has(words[0])) return /\s(a|de)$/.test(n) ? 'prep' : 'adv'
  if (words.length === 2 && ['a', 'de', 'com', 'em'].includes(words[1])) return 'adj' // farto de, alérgico a
  return 'phrase'
}

const lowerFirst = (s: string) => (/^\p{Lu}\p{Ll}/u.test(s) ? s[0].toLocaleLowerCase('pt-PT') + s.slice(1) : s)

function fromSpec(spec: SeedSpec, ru: string, extraForms: string[] = []): SeedEntry {
  return {
    lemma: spec.lemma,
    pos: spec.pos,
    ru: splitRu(spec.ru ?? ru),
    gender: spec.gender,
    fem: spec.fem,
    forms: [...(spec.forms ?? []), ...extraForms],
    refs: [],
  }
}

/** One vocab item (theme word / situation vocab) → seed entries. `warn` collects items that need a SLASH decision. */
export function parseVocabItem(pt: string, ru: string, gender: 'm' | 'f' | 'mf' | undefined, warn: (m: string) => void): SeedEntry[] {
  const raw = pt.trim()
  if (SLASH[raw]) return SLASH[raw].map((s) => fromSpec(s, ru))

  // Parenthetical: «o currículo (CV)» → form «CV»; «pegar (o carro)» → form «pegar o carro»
  let text = raw
  const forms: string[] = []
  const paren = /\s*\(([^)]*)\)/.exec(text)
  if (paren) {
    text = (text.slice(0, paren.index) + text.slice(paren.index + paren[0].length)).trim()
    const inner = paren[1].trim()
    if (/^[\p{Lu}\d]{2,}$/u.test(inner)) forms.push(inner)
    else forms.push(raw.replace(/[()]/g, ''))
  }

  if (text.includes('/')) {
    const parts = text.split(/\s*\/\s*/)
    const stripped = parts.map((p) => {
      const m = ARTICLE_RE.exec(p)
      return m ? { art: m[1].toLowerCase(), rest: m[2] } : { art: '', rest: p }
    })
    if (parts.length === 2 && isFemPair(stripped[0].rest, stripped[1].rest)) {
      const [a, b] = stripped
      const isNoun = !!a.art
      return [
        {
          lemma: a.rest,
          pos: isNoun ? 'noun' : 'adj',
          ru: splitRu(ru),
          gender: isNoun ? 'mf' : undefined,
          forms: [...forms, ...(b.rest !== a.rest ? [b.rest] : [])],
          refs: [],
        },
      ]
    }
    warn(`slash item without a SLASH decision: «${raw}» — each part imported separately`)
    return parts.flatMap((p) => parseVocabItem(p, ru, undefined, warn))
  }

  // «a pé», «a partir de»: the preposition «a», not «article + noun» (→ guessPos: adv / prep)
  const m = startsWithPrepositionA(text) ? null : ARTICLE_RE.exec(text)
  if (m) {
    const art = m[1].toLowerCase()
    return [
      {
        lemma: m[2],
        pos: 'noun',
        ru: splitRu(ru),
        gender: gender ?? (art === 'o' || art === 'os' ? 'm' : 'f'),
        forms,
        refs: [],
      },
    ]
  }
  return [{ lemma: text, pos: guessPos(text), ru: splitRu(ru), gender, forms, refs: [] }]
}

/** One reading-glossary item → seed entries (see GLOSSARY). */
export function parseGlossaryItem(word: string, ru: string): SeedEntry[] {
  const specs = GLOSSARY[word]
  if (specs) {
    const single = !word.trim().includes(' ')
    return specs.map((s) => {
      const autoForm = single && specs.length === 1 && normalizeForm(word) !== normalizeForm(s.lemma) && !s.forms ? [lowerFirst(word)] : []
      return fromSpec(s, ru, autoForm)
    })
  }
  const w = lowerFirst(word.trim())
  return [{ lemma: w, pos: w.includes(' ') ? 'phrase' : guessPos(w), ru: splitRu(ru), forms: [], refs: [] }]
}

/** All seed entries derived from content, merged by id, with theme refs. */
export function deriveSeed(files: Record<string, unknown>, warn: (m: string) => void = () => {}): Map<string, SeedEntry> {
  const merged = new Map<string, SeedEntry>()
  const add = (list: SeedEntry[], ref: string, level: Level | undefined) => {
    for (const e of list) {
      const id = lexEntryId(e)
      const prev = merged.get(id)
      if (!prev) {
        merged.set(id, { ...e, level: minLevel(e.level, level), refs: [ref], forms: [...new Set(e.forms)] })
        continue
      }
      for (const r of e.ru) if (!prev.ru.includes(r)) prev.ru.push(r)
      for (const f of e.forms) if (!prev.forms.includes(f)) prev.forms.push(f)
      if (!prev.refs.includes(ref)) prev.refs.push(ref)
      prev.level = minLevel(prev.level, level)
      if (prev.gender && e.gender && prev.gender !== e.gender) prev.gender = 'mf'
      prev.gender ??= e.gender
      prev.fem ??= e.fem
    }
  }
  const entriesOf = (dir: string) =>
    Object.entries(files)
      .filter(([k]) => k.startsWith(`/content/${dir}/`))
      .sort(([a], [b]) => a.localeCompare(b))

  // 1. Vocab themes (explicit gender, best translations)
  for (const [file, data] of entriesOf('vocab')) {
    const t = VocabThemeSchema.parse(data)
    for (const w of t.words) add(parseVocabItem(w.pt, w.ru, w.gender, (m) => warn(`${file}: ${m}`)), `vocab:${t.id}`, t.level)
  }
  // 2. Situations: vocab, then phrases
  const situations = entriesOf('situations').map(([file, d]) => ({ file, s: SituationSchema.parse(d) }))
  for (const { file, s } of situations) {
    for (const v of s.vocab) add(parseVocabItem(v.pt, v.ru, undefined, (m) => warn(`${file}: ${m}`)), `situation:${s.id}`, s.level)
  }
  // 3. Reading glossaries
  for (const [, data] of entriesOf('reading')) {
    const r = ReadingTextSchema.parse(data)
    for (const g of r.glossary) add(parseGlossaryItem(g.word, g.ru), `reading:${r.id}`, r.level)
  }
  // 4. Situation phrases (whole utterances)
  for (const { s } of situations) {
    for (const p of s.phrases) add([{ lemma: p.pt.trim(), pos: 'phrase', ru: splitRu(p.ru), forms: [], refs: [] }], `situation:${s.id}`, s.level)
  }
  return merged
}

function toSource(e: SeedEntry): LexEntrySource {
  const out: LexEntrySource = { lemma: e.lemma, pos: e.pos, ru: e.ru }
  if (e.gender) out.gender = e.gender
  // fem only if irregular
  if (e.fem && feminine(e.lemma.split(' ')[0]) !== e.fem.split(' ')[0]) out.fem = e.fem
  if (e.pos === 'verb' && /-se(\s|$)/.test(e.lemma)) out.reflexive = true
  const forms = e.forms.filter((f) => normalizeForm(f) !== normalizeForm(e.lemma))
  if (forms.length) out.forms = forms
  if (e.level) out.level = e.level
  return out
}

const KEY_ORDER: (keyof LexEntrySource)[] = ['lemma', 'pos', 'sense', 'ru', 'gender', 'plural', 'fem', 'conj', 'reflexive', 'forms', 'level', 'br', 'note']

const entryOrder = (a: LexEntrySource, b: LexEntrySource) =>
  a.lemma.localeCompare(b.lemma, 'pt') || a.pos.localeCompare(b.pos) || (a.sense ?? 1) - (b.sense ?? 1)

function writeLexiconFile(path: string, entries: LexEntrySource[]) {
  const lines = [...entries].sort(entryOrder).map((e) => '    ' + JSON.stringify(e, KEY_ORDER as string[]))
  writeFileSync(path, `{\n  "entries": [\n${lines.join(',\n')}\n  ]\n}\n`)
}

export function readLexicon(): { file: string; entries: LexEntrySource[] }[] {
  if (!existsSync(lexiconDir)) return []
  return readdirSync(lexiconDir)
    .filter((n) => n.endsWith('.json') && !n.startsWith('_'))
    .sort()
    .map((n) => {
      const file = join(lexiconDir, n)
      const parsed = LexiconFileSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
      if (!parsed.success) {
        throw new Error(`${relative(root, file)}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
      }
      return { file: n, entries: parsed.data.entries }
    })
}

/** Writes entries into their files (keeping an entry where it is if that placement is allowed); removes emptied non-canonical files. */
function writeLayout(placed: { file: string; entry: LexEntrySource }[]) {
  const byFile = new Map<string, LexEntrySource[]>()
  for (const { file, entry } of placed) {
    const target = isPlacedOk(file, entry) ? file : fileFor(entry)
    const list = byFile.get(target)
    if (list) list.push(entry)
    else byFile.set(target, [entry])
  }
  mkdirSync(lexiconDir, { recursive: true })
  for (const f of allFiles()) if (!byFile.has(f)) byFile.set(f, [])
  for (const [f, list] of byFile) writeLexiconFile(join(lexiconDir, f), list)
  // Legacy files (e.g. the phase-1 per-letter a.json …): their entries were moved above
  for (const n of readdirSync(lexiconDir)) {
    if (n.endsWith('.json') && !n.startsWith('_') && !byFile.has(n)) rmSync(join(lexiconDir, n))
  }
  return byFile
}

function seed(force: boolean) {
  const warnings: string[] = []
  const derived = deriveSeed(loadContentFiles(), (m) => warnings.push(m))
  const placed: { file: string; entry: LexEntrySource }[] = []
  const ids = new Set<string>()
  if (!force) {
    for (const f of readLexicon()) {
      for (const e of f.entries) {
        placed.push({ file: f.file, entry: e })
        ids.add(lexEntryId(e))
      }
    }
  }
  let added = 0
  for (const [id, e] of derived) {
    if (ids.has(id)) continue
    const entry = toSource(e)
    placed.push({ file: fileFor(entry), entry })
    ids.add(id)
    added++
  }
  const byFile = writeLayout(placed)
  for (const w of warnings) console.warn(`⚠ ${w}`)
  console.log(`✔ seed: ${derived.size} lemmas from content, ${added} new, ${ids.size} total in ${byFile.size} files (content/lexicon/)`)
}

function format() {
  const placed = readLexicon().flatMap((f) => f.entries.map((entry) => ({ file: f.file, entry })))
  const moved = placed.filter((p) => !isPlacedOk(p.file, p.entry)).length
  writeLayout(placed)
  console.log(`✔ format: ${placed.length} entries, ${moved} moved to their canonical file`)
}

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

const NON_PT_KEYS = new Set([
  'ru', 'title', 'theory', 'ptVsBr', 'commonErrors', 'hint', 'explanation', 'instruction', 'checklist',
  'id', 'topicId', 'module', 'requires', 'tags', 'type', 'level', 'speaker', 'gender', 'notes', 'extraTasks', 'topics',
])
/** Markdown keys with Portuguese examples inside Russian text (bold/italic spans and table cells are extracted). */
const MD_KEYS = new Set(['theory', 'explanation'])
const CYRILLIC = /\p{Script=Cyrillic}/u
/** Words after which a noun is expected (part-of-speech hint for _todo.json). */
const NOMINAL_PREV = new Set(
  'o a os as um uma uns umas em do da dos das no na nos nas ao aos à às pelo pela pelos pelas num numa este esta estes estas esse essa esses essas aquele aquela meu minha meus minhas teu tua seu sua nosso nossa'.split(' '),
)

export interface CorpusText {
  text: string
  /** '/content/situations/no-cafe.json#dialogue[3].pt' */
  src: string
  /** Fragment of markdown theory / cheat-sheet (secondary corpus). */
  md: boolean
}

/** Portuguese fragments of a Russian markdown text: table cells without Cyrillic, bold/italic spans (not ✗ forms). */
export function mdSegments(md: string): string[] {
  const out: string[] = []
  let brCols: number[] = []
  let inTable = false
  for (const line of md.split('\n')) {
    if (/^\s*\|/.test(line)) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim())
      if (!inTable) {
        // header row: remember pt-BR columns, skip the labels themselves
        brCols = cells.flatMap((c, i) => (/\bBR\b|pt-BR|бразил/i.test(c) ? [i] : []))
        inTable = true
        continue
      }
      cells.forEach((c, i) => {
        if (!c || /^:?-+:?$/.test(c) || CYRILLIC.test(c) || brCols.includes(i) || /✗/.test(c)) return
        out.push(c.replace(/[*_`]/g, ' '))
      })
      continue
    }
    inTable = false
    for (const m of line.matchAll(/(\*\*|\*)([^*\n]+?)\1/g)) {
      const before = line[m.index - 1] ?? ' '
      const after = line[m.index + m[0].length] ?? ' '
      const inner = m[2].trim()
      if (/\p{L}/u.test(before) || /\p{L}/u.test(after)) continue // word fragment: **fize**sse
      if (!inner || CYRILLIC.test(inner) || /^-|-$/.test(inner) || /✗/.test(inner)) continue
      if (/✗/.test(line.slice(m.index + m[0].length, m.index + m[0].length + 4))) continue // wrong form
      out.push(inner)
    }
  }
  return out
}

/** Every Portuguese string of the course with its source (structured fields + markdown fragments). */
export function corpusTexts(files: Record<string, unknown>, cheatsheets: Record<string, string> = {}): CorpusText[] {
  const out: CorpusText[] = []
  const visit = (v: unknown, path: string, file: string) => {
    if (typeof v === 'string') {
      if (!CYRILLIC.test(v)) out.push({ text: v, src: `${file}#${path}`, md: false })
    } else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${path}[${i}]`, file))
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        const p = path ? `${path}.${k}` : k
        if (MD_KEYS.has(k) && typeof x === 'string') for (const seg of mdSegments(x)) out.push({ text: seg, src: `${file}#${p}`, md: true })
        else if (!NON_PT_KEYS.has(k)) visit(x, p, file)
      }
    }
  }
  for (const file of Object.keys(files).sort()) visit(files[file], '', file)
  for (const file of Object.keys(cheatsheets).sort()) for (const seg of mdSegments(cheatsheets[file])) out.push({ text: seg, src: file, md: true })
  return out
}

export interface FormStats {
  /** Capitalised occurrences not at the start of a sentence. */
  cap: number
  lower: number
  /** Occurrences after an article / determiner. */
  nominal: number
}

export interface Corpus {
  /** Structured pt strings (dialogues, phrases, readings, examples, exercises): the coverage target. */
  freq: Map<string, number>
  /** Fragments of markdown theory and cheat-sheets (secondary). */
  mdFreq: Map<string, number>
  /** 2..6-word sequences (multi-word lemma forms: «tenho de», «casas de banho»). */
  ngrams: Set<string>
  /** First contexts per form (structured sources first). */
  contexts: Map<string, { text: string; src: string }[]>
  stats: Map<string, FormStats>
}

const MAX_CONTEXTS = 3

function snippet(text: string, start: number, end: number): string {
  const t = text.replace(/\s+/g, ' ')
  if (t.length <= 160) return t
  const a = Math.max(0, start - 70)
  const b = Math.min(t.length, end + 70)
  return (a > 0 ? '…' : '') + t.slice(a, b).trim() + (b < t.length ? '…' : '')
}

export function collectCorpus(files: Record<string, unknown>, cheatsheets: Record<string, string> = {}): Corpus {
  const c: Corpus = { freq: new Map(), mdFreq: new Map(), ngrams: new Set(), contexts: new Map(), stats: new Map() }
  const texts = corpusTexts(files, cheatsheets).sort((a, b) => Number(a.md) - Number(b.md))
  for (const { text, src, md } of texts) {
    // Words only: no numbers / times / flat types (13h, T3, A5); in markdown also no affixes (-ão, re-) and no
    // 1–2-letter fragments unless they are attested words (structured texts are processed first)
    const toks = tokenize(text).filter(
      (t) =>
        /\p{L}/u.test(t.norm) &&
        !/\d/.test(t.norm) &&
        (!md || ((t.norm.length > 2 || c.freq.has(t.norm)) && !/[-+]\s*$/.test(text.slice(0, t.start)) && !/^\s?-/.test(text.slice(t.end)))),
    )
    const freq = md ? c.mdFreq : c.freq
    toks.forEach((t, i) => {
      freq.set(t.norm, (freq.get(t.norm) ?? 0) + 1)
      const ctx = c.contexts.get(t.norm)
      if (!ctx) c.contexts.set(t.norm, [{ text: snippet(text, t.start, t.end), src }])
      else if (ctx.length < MAX_CONTEXTS && !ctx.some((x) => x.src === src)) ctx.push({ text: snippet(text, t.start, t.end), src })
      if (md) return
      const st = c.stats.get(t.norm) ?? { cap: 0, lower: 0, nominal: 0 }
      const before = text.slice(0, t.start).trimEnd()
      const initial = !before || /[.!?…:;«"“—–-]$/.test(before)
      if (/^\p{Lu}/u.test(t.text)) {
        if (!initial) st.cap++
      } else st.lower++
      if (i > 0 && NOMINAL_PREV.has(toks[i - 1].norm)) st.nominal++
      c.stats.set(t.norm, st)
    })
    const norms = toks.map((t) => t.norm)
    for (let n = 2; n <= 6; n++) for (let i = 0; i + n <= norms.length; i++) c.ngrams.add(norms.slice(i, i + n).join(' '))
  }
  return c
}

/** Normalised token → frequency over the structured pt strings (markdown excluded). */
export function corpusFrequencies(files: Record<string, unknown>): Map<string, number> {
  return collectCorpus(files).freq
}

/** Inputs of the bundle: content, cheat-sheets, the lexicon and the morphology code. */
const MORPH_SOURCES = [
  'src/engine/lexicon/conjugate.ts',
  'src/engine/lexicon/irregular.ts',
  'scripts/lexicon/inflect.ts',
  'src/engine/lexicon/endings.ts',
  'src/engine/lexicon/normalize.ts',
]

export function contentHash(files: Record<string, unknown>, lexicon: LexEntrySource[], cheatsheets: Record<string, string> = loadCheatsheets()): string {
  const h = createHash('sha1')
  for (const k of Object.keys(files).sort()) h.update(k).update(JSON.stringify(files[k]))
  for (const k of Object.keys(cheatsheets).sort()) h.update(k).update(cheatsheets[k])
  h.update(JSON.stringify(lexicon))
  for (const f of MORPH_SOURCES) h.update(readFileSync(join(root, f), 'utf8'))
  return h.digest('hex')
}

// ---------------------------------------------------------------------------
// Morphology expansion
// ---------------------------------------------------------------------------

const NOMINAL_POS = new Set<LexPosValue>(['noun', 'adj', 'det', 'pron', 'num'])

/**
 * Generated forms of an entry → morph tag, filtered by `present` (single words: corpus tokens;
 * multi-word lemmas: corpus n-grams, inflecting the first word: «tenho de», «casas de banho»).
 */
export function expandEntry(e: LexEntrySource, present: (form: string) => boolean): [string, string][] {
  const lemma = normalizeForm(e.lemma)
  const words = lemma.split(' ')
  const out = new Map<string, string>()
  const add = (form: string, tag: string) => {
    const f = normalizeForm(form)
    if (!f || f === lemma || !present(f)) return
    const prev = out.get(f)
    out.set(f, prev ? [...new Set([...prev.split(','), ...tag.split(',')])].join(',') : tag)
  }
  if (e.pos === 'verb') {
    // «não adiantar nada»: conjugate the first verb after a leading «não»
    const head = words[0] === 'não' && words.length > 1 ? 1 : 0
    const p = conjugate(words[head], e.conj)
    if (p) for (const [f, tags] of paradigmForms(p)) add([...words.slice(0, head), f, ...words.slice(head + 1)].join(' '), tags.join(','))
  } else if (NOMINAL_POS.has(e.pos)) {
    // numerals inflect only when they have a feminine (primeiro, duzentos); pronouns only with a known feminine
    const pls = e.plural ? [e.plural] : e.pos === 'num' && !e.fem ? [] : plurals(e.lemma)
    for (const p of pls) add(p, 'PL')
    const wantFem = e.pos === 'adj' || e.pos === 'det' || (e.pos === 'noun' && e.gender === 'mf') || (e.pos === 'pron' && lemma in FEM_IRREGULAR)
    const fem = e.fem ?? (wantFem ? feminine(e.lemma) : null)
    if (fem && normalizeForm(fem) !== lemma) {
      add(fem, 'F')
      for (const p of plurals(fem)) add(p, 'FPL')
    }
  }
  return [...out]
}

/** Colloquial clipped verb forms written in dialogues (explicit `forms` of the verb) → the full form they stand for. */
export const COLLOQUIAL_VERB_FORMS: Readonly<Record<string, string>> = {
  tá: 'está',
  tás: 'estás',
  tou: 'estou',
}

/**
 * Pure bundle builder: lexicon entries + corpus (form → frequency, plus n-grams for multi-word lemmas) + theme refs
 * → runtime bundle. Generated forms are indexed only if they occur in the corpus.
 */
export function buildBundle(
  lexicon: LexEntrySource[],
  corpus: ReadonlyMap<string, number>,
  refs: ReadonlyMap<string, string[]>,
  hash = '',
  ngrams: ReadonlySet<string> = new Set(),
): LexiconBundle {
  const ids = new Set<string>()
  const entries: LexEntryTuple[] = []
  const forms: Record<string, [number, string][]> = {}
  const conj: Record<string, string> = {}
  const addForm = (form: string, i: number, tag: string) => {
    const key = normalizeForm(form)
    if (!key) return
    const list = (forms[key] ??= [])
    const existing = list.find(([j]) => j === i)
    if (!existing) list.push([i, tag])
    else if (existing[1] === '' || tag === 'X') return
    else if (tag === '' || existing[1] === 'X') existing[1] = tag // lemma wins; analysed tag beats 'X'
    else existing[1] = [...new Set([...existing[1].split(','), ...tag.split(',')])].join(',')
  }
  const present = (f: string) => (f.includes(' ') ? ngrams.has(f) : corpus.has(f))

  const sorted = [...lexicon].sort(entryOrder)
  for (const e of sorted) {
    const id = lexEntryId(e)
    if (ids.has(id)) throw new Error(`duplicate lexicon id «${id}» (use "sense": 2… for homographs)`)
    ids.add(id)
    const i = entries.length
    const multi = normalizeForm(e.lemma).includes(' ')
    const flags = (e.reflexive || (e.pos === 'verb' && /-se$/.test(normalizeForm(e.lemma))) ? LEX_FLAG.reflexive : 0) | (multi ? LEX_FLAG.multiword : 0)
    entries.push([id, e.lemma, e.pos, e.ru.join('; '), e.gender ?? '', e.level ?? '', flags])
    if (e.pos === 'verb' && e.conj) conj[i] = e.conj

    addForm(e.lemma, i, '')
    for (const [f, tag] of expandEntry(e, present)) addForm(f, i, tag)
    const paradigm = e.pos === 'verb' ? verbForms(normalizeForm(e.lemma).split(' ')[0], e.conj) : null
    for (const f of e.forms ?? []) {
      // colloquial clipped form (tá = está): tagged as such, with the slots of the full form
      const full = COLLOQUIAL_VERB_FORMS[normalizeForm(f)]
      const fullTags = full && paradigm?.get(full)
      addForm(f, i, fullTags ? ['COL', ...fullTags].join(',') : 'X')
      // explicit «levanto-me» → also index the bare host «levanto»
      const cl = splitClitics(f)
      if (cl && cl.hosts[0] && corpus.has(cl.hosts[0])) addForm(cl.hosts[0], i, 'X')
    }
    if (e.br) {
      addForm(e.br, i, 'BR')
      // pt-BR plural of a noun (celulares, ônibus): only if it occurs in the corpus
      if (e.pos === 'noun' && !e.br.includes(' ')) for (const p of plurals(e.br)) if (corpus.has(normalizeForm(p))) addForm(p, i, 'BR')
    }
  }

  const themes: Record<string, number[]> = {}
  const indexById = new Map(entries.map((t, i) => [t[0], i]))
  for (const [id, keys] of refs) {
    const i = indexById.get(id)
    if (i === undefined) continue
    for (const k of keys) (themes[k] ??= []).push(i)
  }
  for (const list of Object.values(themes)) list.sort((a, b) => a - b)

  return { v: 1, hash, entries, forms, themes, ...(Object.keys(conj).length ? { conj } : {}) }
}

/** Plural candidates (kept for tests / seed). */
export const regularPlurals = plurals

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

export interface Coverage {
  uniqueForms: number
  uniqueCovered: number
  tokens: number
  tokensCovered: number
  /** Forms counted as covered because they are listed in content/lexicon/_ignore.json. */
  ignored: number
  /** Forms with more than one candidate lemma. */
  ambiguous: number
  /** Most frequent forms without a lemma. */
  topMissing: [string, number][]
}

/** Is the form resolved by the lexicon (exact, article, contraction or clitic — not accent-fallback or guess)? */
export const isResolved = (lex: Lexicon, form: string) => lex.resolve(form).some((c) => !c.approximate)

export function coverage(bundle: LexiconBundle, corpus: ReadonlyMap<string, number>, ignore: ReadonlySet<string> = new Set()): Coverage {
  const lex = createLexicon(bundle, { verbForms })
  let uniqueCovered = 0
  let tokens = 0
  let tokensCovered = 0
  let ignored = 0
  let ambiguous = 0
  const missing: [string, number][] = []
  for (const [form, n] of corpus) {
    tokens += n
    const r = lex.resolve(form).filter((c) => !c.approximate)
    if (r.length > 1) ambiguous++
    if (r.length || ignore.has(form)) {
      if (!r.length) ignored++
      uniqueCovered++
      tokensCovered += n
    } else missing.push([form, n])
  }
  missing.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt'))
  return { uniqueForms: corpus.size, uniqueCovered, tokens, tokensCovered, ignored, ambiguous, topMissing: missing.slice(0, 40) }
}

/** content/lexicon/_ignore.json: forms that are not Portuguese words (letters, abbreviations, deliberate errors). */
export function readIgnore(): Map<string, string> {
  const out = new Map<string, string>()
  if (!existsSync(ignorePath)) return out
  const data = JSON.parse(readFileSync(ignorePath, 'utf8')) as { ignore?: { form: string; reason: string }[] }
  for (const x of data.ignore ?? []) out.set(normalizeForm(x.form), x.reason)
  return out
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

interface Built {
  bundle: LexiconBundle
  json: string
  corpus: Corpus
  lexFiles: { file: string; entries: LexEntrySource[] }[]
  ignore: Map<string, string>
}

/** Loads everything, checks the lexicon and builds the bundle in memory. Throws on errors. */
export function buildAll(): Built & { problems: string[]; warnings: string[] } {
  const files = loadContentFiles()
  const cheatsheets = loadCheatsheets()
  const lexFiles = readLexicon()
  const lexicon = lexFiles.flatMap((f) => f.entries)
  const problems: string[] = []
  const warnings: string[] = []
  if (!lexicon.length) problems.push('content/lexicon is empty — run `npm run lexicon -- seed` first')

  for (const f of lexFiles) {
    for (const e of f.entries) {
      // Brazilianism linter over Portuguese fields (`br` is pt-BR on purpose, `ru`/`note` are Russian)
      for (const s of [e.lemma, ...(e.forms ?? []), ...(e.plural ? [e.plural] : []), ...(e.fem ? [e.fem] : [])]) {
        for (const p of lintText(s)) problems.push(`brazilianism content/lexicon/${f.file} «${e.lemma}»: ${p} — "${s}"`)
      }
      if (e.conj && !isValidConj(e.conj)) problems.push(`content/lexicon/${f.file} «${e.lemma}»: unknown conj "${e.conj}" (see src/engine/lexicon/irregular.ts)`)
      const vw = normalizeForm(e.lemma).split(' ')
      if (e.pos === 'verb' && !conjugate(vw[0] === 'não' && vw[1] ? vw[1] : vw[0], e.conj)) {
        warnings.push(`content/lexicon/${f.file} «${e.lemma}»: verb lemma does not start with an infinitive — no forms generated`)
      }
      if (!isPlacedOk(f.file, e)) warnings.push(`content/lexicon/${f.file} «${e.lemma}» (${e.pos}) belongs in ${fileFor(e)} — run \`npm run lexicon -- format\``)
    }
  }

  const corpus = collectCorpus(files, cheatsheets)
  const all = new Map(corpus.freq)
  for (const [f, n] of corpus.mdFreq) all.set(f, (all.get(f) ?? 0) + n)
  const refs = new Map([...deriveSeed(files)].map(([id, e]) => [id, e.refs]))
  let bundle: LexiconBundle = { v: 1, hash: '', entries: [], forms: {}, themes: {} }
  try {
    bundle = buildBundle(lexicon, all, refs, contentHash(files, lexicon, cheatsheets), corpus.ngrams)
  } catch (e) {
    problems.push((e as Error).message)
  }
  return { bundle, json: JSON.stringify(bundle), corpus, lexFiles, ignore: readIgnore(), problems, warnings }
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`
const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`

function build(b: ReturnType<typeof buildAll>): boolean {
  for (const w of b.warnings) console.warn(`⚠ ${w}`)
  if (b.problems.length) {
    for (const p of b.problems) console.error(`✖ ${p}`)
    return false
  }
  mkdirSync(join(root, 'src', 'generated'), { recursive: true })
  writeFileSync(bundlePath, b.json + '\n')
  const raw = Buffer.byteLength(b.json)
  const gz = gzipSync(b.json).length
  console.log(
    `✔ build: ${b.bundle.entries.length} entries, ${Object.keys(b.bundle.forms).length} forms, ${Object.keys(b.bundle.themes).length} themes → ` +
      `${relative(root, bundlePath)} (${kb(raw)}, gzip ${kb(gz)})`,
  )
  if (raw > BUNDLE_MAX_BYTES || gz > BUNDLE_MAX_GZIP) {
    console.error(`✖ bundle over budget (raw ≤ ${kb(BUNDLE_MAX_BYTES)}, gzip ≤ ${kb(BUNDLE_MAX_GZIP)}) — split entries/forms (docs/personal-dictionary.md §2.5)`)
    return false
  }
  return true
}

// --- extract ---------------------------------------------------------------

export interface TodoItem {
  /** Suggested lemma (verify!). */
  lemma: string
  /** Suggested part of speech: LexPos, 'name' (proper noun → nouns file) or '?' (decide). */
  pos: string
  /** Owner slice (scripts/lexicon/layout.ts) and suggested file. */
  slice: string
  file?: string
  /** Occurrences in the structured corpus / in markdown fragments. */
  count: number
  md?: number
  /** Unresolved forms of this lemma → frequency. */
  forms: Record<string, number>
  /** The lemma already exists: the morphology missed these forms — add them to `forms`, set `conj`, or fix a table. */
  known?: boolean
  /** Other plausible lemmas. */
  alt?: string[]
  examples: { text: string; src: string }[]
}

interface Suggestion {
  lemma: string
  pos: string
  known: boolean
  alt: string[]
}

const NOUN_SUFFIX = /(ção|ções|são|dade|tude|gem|ismo|mento|ência|ância|eza|ura|ário|eiro|eira|ista|or|ora)s?$/
const ADJ_SUFFIX = /(vel|veis|oso|osa|osos|osas|ivo|iva|ivos|ivas|ico|ica|icos|icas|ante|antes|ente|entes|al|ais)$/
const INFINITIVE = /^\p{L}+(ar|er|ir|ôr)$/u

/** Lemma suggestion for an unresolved form: guesser candidates ranked by corpus support. */
function suggest(form: string, corpus: Corpus, lemmaPos: ReadonlyMap<string, Set<string>>, resolved: ReadonlySet<string>): Suggestion {
  // Support = other attested forms of the candidate's paradigm that are not already explained by another lemma
  const has = (f: string) => f !== form && !resolved.has(f) && (corpus.freq.has(f) || corpus.mdFreq.has(f))
  const attested = (f: string) => f !== form && (corpus.freq.has(f) || corpus.mdFreq.has(f))
  const known = (lemma: string, pos: 'verb' | 'nominal' | 'adv') => {
    const p = lemmaPos.get(lemma)
    if (!p) return false
    return pos === 'verb' ? p.has('verb') : pos === 'adv' ? p.has('adj') : [...p].some((x) => NOMINAL_POS.has(x as LexPosValue))
  }
  const nominalForms = (lemma: string) => {
    const out = new Set([lemma, ...plurals(lemma)])
    const f = feminine(lemma)
    if (f) [f, ...plurals(f)].forEach((x) => out.add(x))
    return out
  }
  const verbSupport = (lemma: string): number | null => {
    const p = conjugate(lemma)
    if (!p) return null
    const pf = paradigmForms(p)
    if (lemma !== form && !pf.has(form)) return null
    let n = 0
    for (const f of pf.keys()) if (has(f)) n++
    if (attested(lemma)) return n + 2
    // a verb nobody uses in its infinitive and with < 3 attested forms is a poor guess (dia → «deir»)
    return lemma !== form && n < 3 ? null : n * 0.6
  }
  const st = corpus.stats.get(form)
  const total = st ? st.lower + st.cap : 0
  // Proper noun: always capitalised in running text (Lisboa, Rita, Inês)
  if (st && st.cap > 0 && st.lower === 0) return { lemma: form, pos: 'name', known: false, alt: [] }
  const nominalCtx = st && total ? st.nominal / total >= 0.25 : false

  const scored: { lemma: string; pos: string; score: number; known: boolean }[] = []
  for (const g of guessLemmas(form) as Guess[]) {
    if (g.pos === 'adv') continue // adverbs in -mente are lemmas themselves
    let s: number | null
    if (g.pos === 'verb') s = verbSupport(g.lemma)
    else {
      const fs = nominalForms(g.lemma)
      if (!fs.has(form) && g.tag !== 'DIM' && g.tag !== 'SUP') s = null
      else s = [...fs].filter(has).length + (attested(g.lemma) ? 2 : 0) + (nominalCtx ? 3 : 0)
    }
    if (s === null) continue
    const k = known(g.lemma, g.pos)
    scored.push({ lemma: g.lemma, pos: g.pos === 'verb' ? 'verb' : 'nominal', score: s + (k ? 6 : 0) + g.weight * 0.05, known: k })
  }
  // The form itself as a lemma
  const selfVerb = INFINITIVE.test(form) ? verbSupport(form) : null
  if (selfVerb !== null) scored.push({ lemma: form, pos: 'verb', score: selfVerb + 1.5, known: false })
  scored.push({ lemma: form, pos: 'nominal', score: 1 + [...nominalForms(form)].filter(has).length + (nominalCtx ? 3 : 0), known: false })
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  let pos = best.pos
  if (pos === 'nominal') {
    const lemma = best.lemma
    if (form.endsWith('mente')) pos = 'adv'
    else if (nominalCtx) pos = 'noun'
    else if (NOUN_SUFFIX.test(lemma)) pos = 'noun'
    else if (ADJ_SUFFIX.test(lemma)) pos = 'adj'
    else pos = '?'
  }
  const alt = [...new Set(scored.slice(1).filter((x) => x.lemma !== best.lemma && x.score >= best.score - 1.5).map((x) => x.lemma))].slice(0, 3)
  if (best.lemma !== form && !alt.includes(form)) alt.push(form) // the form itself may be a lemma too (casa / casar)
  return { lemma: best.lemma, pos, known: best.known, alt }
}

const POS_FILE: Record<string, LexPosValue> = { verb: 'verb', noun: 'noun', name: 'noun', adj: 'adj', adv: 'adv' }

export function extractTodo(b: Built): { items: TodoItem[]; unresolved: number } {
  const lex = createLexicon(b.bundle, { verbForms })
  const lemmaPos = new Map<string, Set<string>>()
  for (const [, lemma, pos] of b.bundle.entries) {
    const k = normalizeForm(lemma)
    const s = lemmaPos.get(k) ?? new Set<string>()
    s.add(pos)
    lemmaPos.set(k, s)
  }
  const groups = new Map<string, TodoItem>()
  let unresolved = 0
  const forms = new Map<string, { n: number; md: number }>()
  for (const [f, n] of b.corpus.freq) forms.set(f, { n, md: 0 })
  for (const [f, n] of b.corpus.mdFreq) {
    const x = forms.get(f)
    if (x) x.md = n
    else forms.set(f, { n: 0, md: n })
  }
  const resolved = new Set<string>()
  for (const form of forms.keys()) if (b.ignore.has(form) || isResolved(lex, form)) resolved.add(form)
  const POS_RANK: Record<string, number> = { '?': 0, adj: 1, noun: 2, adv: 2, verb: 3, name: 3 }
  for (const [form, { n, md }] of forms) {
    if (resolved.has(form)) continue
    unresolved++
    const s = suggest(form, b.corpus, lemmaPos, resolved)
    const key = s.lemma
    let item = groups.get(key)
    if (item && POS_RANK[s.pos] > POS_RANK[item.pos]) {
      item.pos = s.pos
      const filePos = POS_FILE[s.pos]
      if (filePos) item.file = fileFor({ lemma: s.lemma, pos: filePos })
    }
    if (!item) {
      const filePos = POS_FILE[s.pos]
      item = {
        lemma: s.lemma,
        pos: s.pos,
        slice: sliceOf(s.lemma),
        ...(filePos ? { file: fileFor({ lemma: s.lemma, pos: filePos }) } : {}),
        count: 0,
        forms: {},
        examples: [],
      }
      groups.set(key, item)
    }
    item.count += n
    if (md) item.md = (item.md ?? 0) + md
    item.forms[form] = n + md
    if (s.known) item.known = true
    if (s.alt.length) item.alt = [...new Set([...(item.alt ?? []), ...s.alt])].slice(0, 3)
    for (const ex of b.corpus.contexts.get(form) ?? []) if (item.examples.length < 2 && !item.examples.some((x) => x.src === ex.src)) item.examples.push(ex)
  }
  const items = [...groups.values()].sort((a, b) => b.count - a.count || (b.md ?? 0) - (a.md ?? 0) || a.lemma.localeCompare(b.lemma, 'pt'))
  for (const it of items) it.forms = Object.fromEntries(Object.entries(it.forms).sort((a, b) => b[1] - a[1]))
  return { items, unresolved }
}

function sliceStats(items: TodoItem[]) {
  const out: Record<string, { lemmas: number; forms: number; tokens: number; mdOnly: number }> = {}
  for (const [a, z] of SLICES) out[`${a}-${z}`] = { lemmas: 0, forms: 0, tokens: 0, mdOnly: 0 }
  for (const it of items) {
    const s = out[it.slice]
    if (it.count === 0) s.mdOnly++
    else s.lemmas++
    s.forms += Object.keys(it.forms).length
    s.tokens += it.count
  }
  return out
}

function extract(b: Built) {
  const { items, unresolved } = extractTodo(b)
  const lines = items.map((it) => '    ' + JSON.stringify(it))
  const stats = sliceStats(items)
  const head = {
    note:
      'Сгенерировано `npm run lexicon -- extract`. Формы корпуса, которые лексикон + морфология не разбирают, сгруппированы по ПРЕДПОЛАГАЕМОЙ лемме. ' +
      'lemma/pos — догадка, проверяйте. known: лемма уже есть, не хватает формы (forms / conj). pos "name" — имя собственное (nouns-*), "?" — решите сами. ' +
      'count — в упражнениях/диалогах/текстах, md — только в теории и шпаргалках (ниже приоритет). Не редактируйте вручную: см. content/README.md, раздел «Лексикон».',
    forms: unresolved,
    lemmas: items.length,
    slices: stats,
  }
  const headJson = JSON.stringify(head, null, 2).replace(/\n}$/, '')
  writeFileSync(todoPath, `${headJson},\n  "items": [\n${lines.join(',\n')}\n  ]\n}\n`)
  console.log(`✔ extract: ${unresolved} unresolved forms → ${items.length} suggested lemmas → ${relative(root, todoPath)}`)
  for (const [s, x] of Object.entries(stats)) {
    console.log(`  slice ${s}: ${x.lemmas} lemmas (+${x.mdOnly} theory-only), ${x.forms} forms, ${x.tokens} tokens`)
  }
}

function report(b: Built) {
  const ignore = new Set(b.ignore.keys())
  const main = coverage(b.bundle, b.corpus.freq, ignore)
  const md = coverage(b.bundle, b.corpus.mdFreq, ignore)
  const files = b.lexFiles.map((f) => `${f.file.replace(/\.json$/, '')} ${f.entries.length}`).join(', ')
  const byPos = new Map<string, number>()
  for (const e of b.bundle.entries) byPos.set(e[2], (byPos.get(e[2]) ?? 0) + 1)
  console.log(`\nLexicon: ${b.bundle.entries.length} entries (${[...byPos].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(', ')})`)
  console.log(`  files: ${files}`)
  console.log(
    `Coverage (exercises, dialogues, texts): ${main.uniqueCovered}/${main.uniqueForms} unique forms (${pct(main.uniqueCovered, main.uniqueForms)}), ` +
      `${main.tokensCovered}/${main.tokens} tokens (${pct(main.tokensCovered, main.tokens)}); ignored ${main.ignored}, ambiguous ${main.ambiguous}`,
  )
  console.log(
    `Coverage (theory / cheat-sheet fragments): ${md.uniqueCovered}/${md.uniqueForms} unique forms (${pct(md.uniqueCovered, md.uniqueForms)}), ` +
      `${md.tokensCovered}/${md.tokens} tokens (${pct(md.tokensCovered, md.tokens)})`,
  )
  console.log(`Top missing: ${main.topMissing.map(([f, n]) => `${f} ${n}`).join(', ')}`)
}

function todo(slice: string | undefined, limit: number) {
  if (!existsSync(todoPath)) {
    console.error('✖ no _todo.json — run `npm run lexicon -- extract`')
    process.exit(1)
  }
  const data = JSON.parse(readFileSync(todoPath, 'utf8')) as { items: TodoItem[] }
  const items = data.items.filter((it) => !slice || it.slice === slice).slice(0, limit)
  for (const it of items) {
    const forms = Object.entries(it.forms).map(([f, n]) => `${f}×${n}`).join(' ')
    const flags = [it.known ? 'KNOWN' : '', it.alt?.length ? `alt: ${it.alt.join('/')}` : '', it.count === 0 ? 'theory-only' : ''].filter(Boolean).join('; ')
    console.log(`${String(it.count).padStart(4)}  ${it.lemma} [${it.pos}] ${it.file ?? ''}  ← ${forms}${flags ? `  (${flags})` : ''}`)
    if (it.examples[0]) console.log(`        «${it.examples[0].text}»  ${it.examples[0].src}`)
  }
}

// ---------------------------------------------------------------------------

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd = 'all', ...rest] = process.argv.slice(2)
  const limitArg = rest.indexOf('--limit')
  const limit = limitArg >= 0 ? Number(rest[limitArg + 1]) : Infinity
  if (cmd === 'seed') seed(rest.includes('--force'))
  else if (cmd === 'format') format()
  else if (cmd === 'todo') todo(rest.find((x) => /^[a-z]-[a-z]$/.test(x)), limit)
  else if (cmd === 'build' || cmd === 'extract' || cmd === 'report' || cmd === 'all') {
    const b = buildAll()
    let ok = true
    if (cmd === 'build' || cmd === 'all') ok = build(b)
    else if (b.problems.length) {
      for (const p of b.problems) console.error(`✖ ${p}`)
      ok = false
    }
    if (ok && (cmd === 'extract' || cmd === 'all')) extract(b)
    if (ok && (cmd === 'report' || cmd === 'all' || cmd === 'build')) report(b)
    if (!ok) process.exit(1)
  } else {
    console.error('usage: npm run lexicon [-- build | extract | report | todo <slice> [--limit N] | format | seed [--force]]')
    process.exit(1)
  }
}
