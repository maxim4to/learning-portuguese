/**
 * npm run lexicon -- <cmd>
 *
 *   seed   Import lemmas from existing content (vocab themes, situation vocab + phrases, reading glossaries)
 *          into content/lexicon/<letter>.json. Existing entries (same id) are kept as authored;
 *          only new ids are added. `--force` rewrites the seed entries from scratch.
 *   build  Compile content/lexicon/*.json → src/generated/lexicon.json (runtime bundle, committed),
 *          check Brazilianisms in lemmas/forms, print size and corpus coverage.
 *
 * Content is authored in-session (scripts/lexicon/seed-data.ts) — no API calls.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
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
import { createLexicon } from '../src/engine/lexicon/lookup.ts'
import { foldDiacritics, normalizeForm, splitClitics, tokenize } from '../src/engine/lexicon/normalize.ts'
import { LEX_FLAG, type LexEntryTuple, type LexiconBundle } from '../src/engine/lexicon/types.ts'
import { lintText } from './brazilianisms.ts'
import { GLOSSARY, POS, SLASH, type SeedSpec } from './lexicon/seed-data.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const contentDir = join(root, 'content')
const lexiconDir = join(contentDir, 'lexicon')
const bundlePath = join(root, 'src', 'generated', 'lexicon.json')

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

/** Regular feminine of a masculine noun/adjective (or null). */
export function regularFem(w: string): string | null {
  if (w.endsWith('ão')) return w.slice(0, -2) + 'ã'
  if (w.endsWith('ês')) return w.slice(0, -2) + 'esa'
  if (w.endsWith('or')) return w + 'a'
  if (w.endsWith('eu')) return w.slice(0, -2) + 'eia'
  if (w.endsWith('o')) return w.slice(0, -1) + 'a'
  return null
}

/** Regular plural candidates of a noun/adjective (filtered against the corpus by `build`). */
export function regularPlurals(w: string): string[] {
  if (/[aeiouáéíóúâêôã]$/u.test(w) && !w.endsWith('ão')) return [w + 's']
  if (w.endsWith('ão')) return [w.slice(0, -2) + 'ões']
  if (w.endsWith('ês')) return [w.slice(0, -2) + 'eses']
  if (/[rz]$/.test(w)) return [w + 'es']
  if (w.endsWith('al')) return [w.slice(0, -2) + 'ais']
  if (w.endsWith('el')) return [w.slice(0, -2) + 'éis', w.slice(0, -2) + 'eis']
  if (w.endsWith('ol')) return [w.slice(0, -2) + 'óis']
  if (w.endsWith('ul')) return [w.slice(0, -2) + 'uis']
  if (w.endsWith('il')) return [w.slice(0, -2) + 'is', w.slice(0, -2) + 'eis']
  if (w.endsWith('m')) return [w.slice(0, -1) + 'ns']
  if (w.endsWith('n')) return [w + 's']
  return []
}

/** Is «b» the feminine counterpart of «a» (single word or first word of an expression)? */
function isFemPair(a: string, b: string): boolean {
  if (a === b) return true
  const [a0, ...ar] = a.split(' ')
  const [b0, ...br] = b.split(' ')
  return ar.join(' ') === br.join(' ') && regularFem(a0) === b0
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

  const m = ARTICLE_RE.exec(text)
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
  if (e.fem && regularFem(e.lemma.split(' ')[0]) !== e.fem.split(' ')[0]) out.fem = e.fem
  if (e.pos === 'verb' && /-se(\s|$)/.test(e.lemma)) out.reflexive = true
  const forms = e.forms.filter((f) => normalizeForm(f) !== normalizeForm(e.lemma))
  if (forms.length) out.forms = forms
  if (e.level) out.level = e.level
  return out
}

/** content/lexicon/<file>.json name for a lemma: first latin letter, '0' for digits/other. */
function fileKey(lemma: string): string {
  const c = foldDiacritics(normalizeForm(lemma))[0] ?? '0'
  return /[a-z]/.test(c) ? c : '0'
}

const KEY_ORDER: (keyof LexEntrySource)[] = ['lemma', 'pos', 'sense', 'ru', 'gender', 'plural', 'fem', 'conj', 'reflexive', 'forms', 'level', 'br', 'note']

function writeLexiconFile(path: string, entries: LexEntrySource[]) {
  const sorted = [...entries].sort((a, b) => a.lemma.localeCompare(b.lemma, 'pt') || a.pos.localeCompare(b.pos) || (a.sense ?? 1) - (b.sense ?? 1))
  const lines = sorted.map((e) => '    ' + JSON.stringify(e, KEY_ORDER as string[]))
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

function seed(force: boolean) {
  const warnings: string[] = []
  const derived = deriveSeed(loadContentFiles(), (m) => warnings.push(m))
  const existing = new Map<string, LexEntrySource>()
  if (!force) for (const f of readLexicon()) for (const e of f.entries) existing.set(lexEntryId(e), e)
  const byFile = new Map<string, LexEntrySource[]>()
  let added = 0
  const all = new Map(existing)
  for (const [id, e] of derived) {
    if (!all.has(id)) {
      all.set(id, toSource(e))
      added++
    }
  }
  for (const e of all.values()) {
    const k = fileKey(e.lemma)
    const list = byFile.get(k)
    if (list) list.push(e)
    else byFile.set(k, [e])
  }
  mkdirSync(lexiconDir, { recursive: true })
  for (const [k, list] of byFile) writeLexiconFile(join(lexiconDir, `${k}.json`), list)
  for (const w of warnings) console.warn(`⚠ ${w}`)
  console.log(`✔ seed: ${derived.size} lemmas from content, ${added} new, ${all.size} total in ${byFile.size} files (content/lexicon/)`)
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const NON_PT_KEYS = new Set([
  'ru', 'title', 'theory', 'ptVsBr', 'commonErrors', 'hint', 'explanation', 'instruction', 'checklist',
  'id', 'topicId', 'module', 'requires', 'tags', 'type', 'level', 'speaker', 'gender', 'notes', 'extraTasks',
])
const CYRILLIC = /\p{Script=Cyrillic}/u

/** Normalised token → frequency over all pt strings of the content (markdown theory excluded). */
export function corpusFrequencies(files: Record<string, unknown>): Map<string, number> {
  const freq = new Map<string, number>()
  const visit = (v: unknown) => {
    if (typeof v === 'string') {
      if (CYRILLIC.test(v)) return
      for (const t of tokenize(v)) if (/\p{L}/u.test(t.norm)) freq.set(t.norm, (freq.get(t.norm) ?? 0) + 1)
    } else if (Array.isArray(v)) v.forEach(visit)
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) if (!NON_PT_KEYS.has(k)) visit(x)
    }
  }
  for (const [file, data] of Object.entries(files)) if (!file.includes('/cheatsheets/')) visit(data)
  return freq
}

export function contentHash(files: Record<string, unknown>, lexicon: LexEntrySource[]): string {
  const h = createHash('sha1')
  for (const k of Object.keys(files).sort()) h.update(k).update(JSON.stringify(files[k]))
  h.update(JSON.stringify(lexicon))
  return h.digest('hex')
}

/**
 * Pure bundle builder: lexicon entries + corpus frequencies + theme refs → runtime bundle.
 * Generated plural/feminine forms are kept only if they occur in the corpus.
 */
export function buildBundle(
  lexicon: LexEntrySource[],
  corpus: ReadonlyMap<string, number>,
  refs: ReadonlyMap<string, string[]>,
  hash = '',
): LexiconBundle {
  const ids = new Set<string>()
  const entries: LexEntryTuple[] = []
  const forms: Record<string, [number, string][]> = {}
  const addForm = (form: string, i: number, tag: string) => {
    const key = normalizeForm(form)
    if (!key) return
    const list = (forms[key] ??= [])
    const existing = list.find(([j]) => j === i)
    if (!existing) list.push([i, tag])
    else if (tag === '' && existing[1] !== '') existing[1] = '' // lemma tag wins
  }

  const sorted = [...lexicon].sort((a, b) => a.lemma.localeCompare(b.lemma, 'pt') || a.pos.localeCompare(b.pos) || (a.sense ?? 1) - (b.sense ?? 1))
  for (const e of sorted) {
    const id = lexEntryId(e)
    if (ids.has(id)) throw new Error(`duplicate lexicon id «${id}» (use "sense": 2… for homographs)`)
    ids.add(id)
    const i = entries.length
    const multi = normalizeForm(e.lemma).includes(' ')
    const flags = (e.reflexive || (e.pos === 'verb' && /-se$/.test(normalizeForm(e.lemma))) ? LEX_FLAG.reflexive : 0) | (multi ? LEX_FLAG.multiword : 0)
    entries.push([id, e.lemma, e.pos, e.ru.join('; '), e.gender ?? '', e.level ?? '', flags])

    addForm(e.lemma, i, '')
    for (const f of e.forms ?? []) {
      addForm(f, i, 'X')
      // explicit «levanto-me» → also index the bare host «levanto»
      const cl = splitClitics(f)
      if (cl && cl.hosts[0] && corpus.has(cl.hosts[0])) addForm(cl.hosts[0], i, 'X')
    }
    if ((e.pos === 'noun' || e.pos === 'adj') && !multi) {
      const lemma = normalizeForm(e.lemma)
      const inCorpus = (f: string) => corpus.has(normalizeForm(f))
      const plurals = e.plural ? [e.plural] : regularPlurals(lemma)
      for (const p of plurals) if (inCorpus(p)) addForm(p, i, 'PL')
      if (e.pos === 'adj' || e.gender === 'mf') {
        const fem = e.fem ?? regularFem(lemma)
        if (fem && fem !== lemma) {
          if (inCorpus(fem)) addForm(fem, i, 'F')
          for (const p of regularPlurals(fem)) if (inCorpus(p)) addForm(p, i, 'FPL')
        }
      }
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

  return { v: 1, hash, entries, forms, themes }
}

export interface Coverage {
  uniqueForms: number
  uniqueCovered: number
  tokens: number
  tokensCovered: number
  /** Most frequent forms without a lemma. */
  topMissing: [string, number][]
}

export function coverage(bundle: LexiconBundle, corpus: ReadonlyMap<string, number>): Coverage {
  const lex = createLexicon(bundle)
  let uniqueCovered = 0
  let tokens = 0
  let tokensCovered = 0
  const missing: [string, number][] = []
  for (const [form, n] of corpus) {
    tokens += n
    if (lex.resolve(form).some((c) => !c.approximate)) {
      uniqueCovered++
      tokensCovered += n
    } else missing.push([form, n])
  }
  missing.sort((a, b) => b[1] - a[1])
  return { uniqueForms: corpus.size, uniqueCovered, tokens, tokensCovered, topMissing: missing.slice(0, 25) }
}

function build() {
  const files = loadContentFiles()
  const lexFiles = readLexicon()
  const lexicon = lexFiles.flatMap((f) => f.entries)
  if (!lexicon.length) {
    console.error('✖ content/lexicon is empty — run `npm run lexicon -- seed` first')
    process.exit(1)
  }

  // Brazilianism linter over Portuguese fields (lemma, forms; `br` is pt-BR on purpose, `ru`/`note` are Russian)
  const problems: string[] = []
  for (const f of lexFiles) {
    for (const e of f.entries) {
      for (const s of [e.lemma, ...(e.forms ?? []), ...(e.plural ? [e.plural] : []), ...(e.fem ? [e.fem] : [])]) {
        for (const p of lintText(s)) problems.push(`brazilianism content/lexicon/${f.file} «${e.lemma}»: ${p} — "${s}"`)
      }
    }
  }
  if (problems.length) {
    for (const p of problems) console.error(`✖ ${p}`)
    process.exit(1)
  }

  const corpus = corpusFrequencies(files)
  const refs = new Map([...deriveSeed(files)].map(([id, e]) => [id, e.refs]))
  const bundle = buildBundle(lexicon, corpus, refs, contentHash(files, lexicon))
  const json = JSON.stringify(bundle)
  mkdirSync(join(root, 'src', 'generated'), { recursive: true })
  writeFileSync(bundlePath, json + '\n')

  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`
  const cov = coverage(bundle, corpus)
  const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`
  console.log(
    `✔ build: ${bundle.entries.length} entries, ${Object.keys(bundle.forms).length} forms, ${Object.keys(bundle.themes).length} themes → ` +
      `${relative(root, bundlePath)} (${kb(Buffer.byteLength(json))}, gzip ${kb(gzipSync(json).length)})`,
  )
  console.log(
    `  corpus coverage: ${cov.uniqueCovered}/${cov.uniqueForms} unique forms (${pct(cov.uniqueCovered, cov.uniqueForms)}), ` +
      `${cov.tokensCovered}/${cov.tokens} tokens (${pct(cov.tokensCovered, cov.tokens)})`,
  )
  console.log(`  most frequent forms without a lemma: ${cov.topMissing.map(([f, n]) => `${f} ${n}`).join(', ')}`)
  if (Buffer.byteLength(json) > 1024 * 1024) {
    console.error('✖ bundle > 1 MB — split entries/forms (docs/personal-dictionary.md §2.5)')
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, ...rest] = process.argv.slice(2)
  if (cmd === 'seed') seed(rest.includes('--force'))
  else if (cmd === 'build') build()
  else {
    console.error('usage: npm run lexicon -- seed [--force] | build')
    process.exit(1)
  }
}
