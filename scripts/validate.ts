/**
 * npm run validate [-- --check-audio]
 *
 * 1. Loads every /content/**.json, validates with zod schemas and cross-references
 *    (same code as the app loader: src/content/build.ts).
 * 2. Brazilianism linter over Portuguese strings.
 * 3. Lexicon (content/lexicon → src/generated/lexicon.json, see scripts/lexicon.ts): the bundle must be up to date
 *    (error) and cover the corpus (warning until the end of phase 4, see LEXICON_COVERAGE_TARGET).
 * 4. With --check-audio: reports `audio: true` items without /public/audio/<sha1>.mp3.
 * Exit code 1 on any error.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildContentIndex, type ContentIndex } from '../src/content/build.ts'
import { audioHash } from '../src/engine/audioHash.ts'
import { lintText } from './brazilianisms.ts'
import { collectCorpus, contentHash, coverage, readIgnore, readLexicon } from './lexicon.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const contentDir = join(root, 'content')
const lexiconDir = join(contentDir, 'lexicon')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : []
  })
}

const errors: string[] = []
const warnings: string[] = []
const files: Record<string, unknown> = {}
for (const abs of walk(contentDir)) {
  if (abs.startsWith(lexiconDir)) continue // the lexicon has its own schema and pipeline (section 3)
  const key = '/' + relative(root, abs).split('\\').join('/')
  try {
    files[key] = JSON.parse(readFileSync(abs, 'utf8'))
  } catch (e) {
    errors.push(`${key}: invalid JSON — ${(e as Error).message}`)
  }
}

const built = buildContentIndex(files)
errors.push(...built.errors, ...built.missing)
warnings.push(...built.warnings)
const index = built.index

// ---------------------------------------------------------------------------
// Brazilianism linter
// ---------------------------------------------------------------------------

/** Keys whose values are not Portuguese or intentionally discuss pt-BR. */
const SKIP_KEYS = new Set(['ru', 'title', 'ptVsBr', 'commonErrors', 'hint', 'explanation', 'instruction', 'checklist', 'id', 'topicId', 'module', 'requires', 'tags', 'type', 'level', 'speaker', 'gender'])
/** Mixed ru/pt markdown — findings are warnings only. */
const SOFT_KEYS = new Set(['theory'])

function lintValue(value: unknown, path: string, soft: boolean) {
  if (typeof value === 'string') {
    for (const p of lintText(value)) (soft ? warnings : errors).push(`brazilianism ${path}: ${p} — "${value.slice(0, 80)}"`)
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => lintValue(v, `${path}[${i}]`, soft))
  } else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    for (const [k, v] of Object.entries(obj)) {
      if (SKIP_KEYS.has(k)) continue
      // Choice distractors may deliberately be wrong (e.g. Brazilian forms): lint only the correct option.
      if (k === 'options' && Array.isArray(v) && typeof obj.correct === 'number') {
        lintValue(v[obj.correct], `${path}.options[${obj.correct}]`, soft)
        continue
      }
      lintValue(v, `${path}.${k}`, soft || SOFT_KEYS.has(k))
    }
  }
}

for (const [file, data] of Object.entries(files)) lintValue(data, file, false)

// ---------------------------------------------------------------------------
// Lexicon: bundle freshness + corpus coverage
// ---------------------------------------------------------------------------

/**
 * Lexicon coverage gate (phase 4 done, 2026-10): every corpus form resolved by the lexicon or listed in
 * content/lexicon/_ignore.json — 5281/5281 unique forms, 60512/60512 tokens (100 %) of exercises, dialogues and texts.
 * Error below LEXICON_TOKEN_COVERAGE_MIN (achieved − 0.5 %: room for a few new words in fresh content until the
 * next `npm run lexicon` pass); any unresolved form is still a warning (target 100 %).
 */
const LEXICON_TOKEN_COVERAGE_MIN = 0.995
try {
  const lexicon = readLexicon().flatMap((f) => f.entries)
  const bundle = JSON.parse(readFileSync(join(root, 'src', 'generated', 'lexicon.json'), 'utf8'))
  if (bundle.hash !== contentHash(files, lexicon)) {
    errors.push('src/generated/lexicon.json is stale (content, lexicon or morphology changed) — run `npm run lexicon -- build`')
  }
  const cov = coverage(bundle, collectCorpus(files).freq, new Set(readIgnore().keys()))
  const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`
  const summary =
    `lexicon coverage ${pct(cov.uniqueCovered, cov.uniqueForms)} of unique forms, ${pct(cov.tokensCovered, cov.tokens)} of tokens; ` +
    `unresolved (add to content/lexicon or _ignore.json, see npm run lexicon): ` +
    cov.topMissing.slice(0, 8).map(([f]) => f).join(', ')
  if (cov.tokensCovered < cov.tokens * LEXICON_TOKEN_COVERAGE_MIN) {
    errors.push(`${summary} — below the gate of ${(LEXICON_TOKEN_COVERAGE_MIN * 100).toFixed(1)}% of tokens`)
  } else if (cov.uniqueCovered < cov.uniqueForms) {
    warnings.push(summary)
  }
} catch (e) {
  errors.push(`lexicon: ${(e as Error).message}`)
}

// ---------------------------------------------------------------------------
// Audio presence (optional)
// ---------------------------------------------------------------------------

function audioTexts(ix: ContentIndex): string[] {
  const out: string[] = []
  for (const t of ix.topics.values()) for (const e of t.examples) if (e.audio) out.push(e.pt)
  for (const v of ix.vocab.values()) for (const w of v.words) if (w.audio) out.push(w.pt)
  return out
}

if (process.argv.includes('--check-audio')) {
  const missing: string[] = []
  for (const text of audioTexts(index)) {
    if (!existsSync(join(root, 'public', 'audio', `${await audioHash(text)}.mp3`))) missing.push(text)
  }
  if (missing.length) warnings.push(`audio: ${missing.length} file(s) missing (run the TTS script), e.g. "${missing[0]}"`)
}

// ---------------------------------------------------------------------------

for (const w of warnings) console.warn(`⚠ ${w}`)
for (const e of errors) console.error(`✖ ${e}`)
const exCount = index.exercises.size
console.log(
  `\nContent: ${index.topics.size} topics, ${index.situations.size} situations, ${index.vocab.size} vocab themes, ` +
    `${index.reading.size} reading texts, ${index.diagnostic.questions.length} diagnostic questions, ${exCount} exercises total.`,
)
if (errors.length) {
  console.error(`\n✖ ${errors.length} error(s), ${warnings.length} warning(s)`)
  process.exit(1)
}
console.log(`✔ Content valid (${warnings.length} warning(s))`)
