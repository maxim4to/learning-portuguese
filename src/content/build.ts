/**
 * Pure content indexing + cross-reference validation.
 * Shared by the runtime loader (src/content/index.ts) and scripts/validate.ts.
 *
 * Input: a map of `/content/<relative path>.json` → parsed JSON.
 * File routing:
 *   /content/syllabus.json         → Syllabus
 *   /content/diagnostic.json       → Diagnostic
 *   /content/grammar/<id>.json     → Topic
 *   /content/situations/<id>.json  → Situation
 *   /content/vocab/<id>.json       → VocabTheme
 *   /content/reading/<id>.json     → ReadingText
 *   /content/tutor/<id>.json       → TutorNotes (id = an existing topic/situation/reading/vocab id)
 * The file basename must equal the object's `id`.
 */
import type { z } from 'zod'
import {
  DiagnosticSchema,
  ReadingTextSchema,
  SituationSchema,
  SyllabusSchema,
  TopicSchema,
  TutorNotesSchema,
  VocabThemeSchema,
  type Diagnostic,
  type Exercise,
  type Level,
  type ReadingText,
  type Situation,
  type Syllabus,
  type SyllabusModule,
  type Topic,
  type TutorNotes,
  type VocabTheme,
} from './schema.ts'

export type ExerciseOwnerKind = 'topic' | 'topic-minitest' | 'situation' | 'reading' | 'diagnostic'

export interface ExerciseLocation {
  exercise: Exercise
  ownerKind: ExerciseOwnerKind
  /** Topic / situation / reading id; `"diagnostic"` for diagnostic questions. */
  ownerId: string
}

export interface ContentIndex {
  syllabus: Syllabus
  diagnostic: Diagnostic
  topics: Map<string, Topic>
  situations: Map<string, Situation>
  vocab: Map<string, VocabTheme>
  reading: Map<string, ReadingText>
  /** Optional tutor-prompt additions, keyed by item id. */
  tutor: Map<string, TutorNotes>
  /** moduleId → { level, module } */
  modules: Map<string, { level: Level; module: SyllabusModule }>
  /** Topic ids in syllabus order, followed by topics not referenced in the syllabus. */
  topicOrder: string[]
  /** exercise id → where it lives */
  exercises: Map<string, ExerciseLocation>
}

export interface BuildResult {
  index: ContentIndex
  errors: string[]
  warnings: string[]
  /**
   * References to grammar topics that don't exist yet (syllabus entries, `requires`).
   * `npm run validate` treats them as errors; the runtime loader only warns, so the
   * app keeps working while the course is being authored.
   */
  missing: string[]
}

function formatZodError(file: string, err: z.ZodError): string[] {
  return err.issues.map((i) => `${file}: ${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
}

const basename = (p: string) => p.split('/').pop()!.replace(/\.json$/, '')

export function buildContentIndex(files: Record<string, unknown>): BuildResult {
  const errors: string[] = []
  const warnings: string[] = []
  const missing: string[] = []

  let syllabus: Syllabus = { levels: [] }
  let diagnostic: Diagnostic = { questions: [] }
  const topics = new Map<string, Topic>()
  const situations = new Map<string, Situation>()
  const vocab = new Map<string, VocabTheme>()
  const reading = new Map<string, ReadingText>()
  const tutor = new Map<string, TutorNotes>()

  let sawSyllabus = false
  let sawDiagnostic = false

  function parseInto<T extends { id: string }>(
    file: string,
    data: unknown,
    schema: z.ZodType<T>,
    map: Map<string, T>,
  ) {
    const r = schema.safeParse(data)
    if (!r.success) {
      errors.push(...formatZodError(file, r.error))
      return
    }
    if (r.data.id !== basename(file)) {
      errors.push(`${file}: id "${r.data.id}" must match the file name "${basename(file)}"`)
    }
    if (map.has(r.data.id)) errors.push(`${file}: duplicate id "${r.data.id}"`)
    map.set(r.data.id, r.data)
  }

  for (const [rawPath, data] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const file = rawPath.replace(/^.*?\/content\//, '/content/')
    const rel = file.slice('/content/'.length)
    if (rel === 'syllabus.json') {
      const r = SyllabusSchema.safeParse(data)
      if (r.success) syllabus = r.data
      else errors.push(...formatZodError(file, r.error))
      sawSyllabus = true
    } else if (rel === 'diagnostic.json') {
      const r = DiagnosticSchema.safeParse(data)
      if (r.success) diagnostic = r.data
      else errors.push(...formatZodError(file, r.error))
      sawDiagnostic = true
    } else if (/^grammar\/[^/]+\.json$/.test(rel)) parseInto(file, data, TopicSchema, topics)
    else if (/^situations\/[^/]+\.json$/.test(rel)) parseInto(file, data, SituationSchema, situations)
    else if (/^vocab\/[^/]+\.json$/.test(rel)) parseInto(file, data, VocabThemeSchema, vocab)
    else if (/^reading\/[^/]+\.json$/.test(rel)) parseInto(file, data, ReadingTextSchema, reading)
    else if (/^tutor\/[^/]+\.json$/.test(rel)) parseInto(file, data, TutorNotesSchema, tutor)
    else warnings.push(`${file}: unknown content file location, ignored`)
  }
  if (!sawSyllabus) errors.push('/content/syllabus.json is missing')
  if (!sawDiagnostic) errors.push('/content/diagnostic.json is missing')

  // --- syllabus ↔ topics -----------------------------------------------------
  const modules = new Map<string, { level: Level; module: SyllabusModule }>()
  const topicOrder: string[] = []
  const seenInSyllabus = new Set<string>()
  for (const lvl of syllabus.levels) {
    for (const mod of lvl.modules) {
      if (modules.has(mod.id)) errors.push(`syllabus: duplicate module id "${mod.id}"`)
      modules.set(mod.id, { level: lvl.level, module: mod })
      for (const tid of mod.topics) {
        if (seenInSyllabus.has(tid)) errors.push(`syllabus: topic "${tid}" listed more than once`)
        seenInSyllabus.add(tid)
        const t = topics.get(tid)
        if (!t) {
          missing.push(`syllabus: module "${mod.id}" references missing topic "${tid}" (expected /content/grammar/${tid}.json)`)
          continue
        }
        topicOrder.push(tid)
        if (t.module !== mod.id) errors.push(`topic "${tid}": module is "${t.module}" but syllabus lists it under "${mod.id}"`)
        if (t.level !== lvl.level) errors.push(`topic "${tid}": level ${t.level} but syllabus lists it under ${lvl.level}`)
      }
    }
  }
  for (const tid of topics.keys()) {
    if (!seenInSyllabus.has(tid)) {
      warnings.push(`topic "${tid}" is not referenced in syllabus.json`)
      topicOrder.push(tid)
    }
  }

  // --- tutor overrides → existing items ------------------------------------------
  for (const tid of tutor.keys()) {
    if (!topics.has(tid) && !situations.has(tid) && !reading.has(tid) && !vocab.has(tid))
      errors.push(`/content/tutor/${tid}.json: no topic / situation / reading / vocab theme with id "${tid}"`)
  }

  // --- requires ----------------------------------------------------------------
  for (const t of topics.values()) {
    for (const r of t.requires) {
      if (!topics.has(r)) missing.push(`topic "${t.id}": requires unknown topic "${r}"`)
      if (r === t.id) errors.push(`topic "${t.id}": requires itself`)
    }
  }
  // cycle detection
  const state = new Map<string, 1 | 2>()
  const visit = (tid: string, stack: string[]) => {
    if (state.get(tid) === 2) return
    if (state.get(tid) === 1) {
      errors.push(`requires cycle: ${[...stack, tid].join(' → ')}`)
      return
    }
    state.set(tid, 1)
    for (const r of topics.get(tid)?.requires ?? []) if (topics.has(r)) visit(r, [...stack, tid])
    state.set(tid, 2)
  }
  for (const tid of topics.keys()) visit(tid, [])

  // --- exercises ---------------------------------------------------------------
  const exercises = new Map<string, ExerciseLocation>()
  const addExercise = (ex: Exercise, ownerKind: ExerciseOwnerKind, ownerId: string, allowedTopicIds: Set<string>) => {
    const where = `${ownerKind} "${ownerId}" exercise "${ex.id}"`
    if (exercises.has(ex.id)) {
      const prev = exercises.get(ex.id)!
      errors.push(`${where}: duplicate exercise id (also in ${prev.ownerKind} "${prev.ownerId}")`)
    }
    exercises.set(ex.id, { exercise: ex, ownerKind, ownerId })
    if (!allowedTopicIds.has(ex.topicId) && !topics.has(ex.topicId)) {
      errors.push(`${where}: topicId "${ex.topicId}" does not exist`)
    }
    errors.push(...checkExerciseSemantics(ex).map((m) => `${where}: ${m}`))
  }
  for (const t of topics.values()) {
    const own = new Set([t.id])
    for (const ex of t.exercises) addExercise(ex, 'topic', t.id, own)
    for (const ex of t.miniTest) addExercise(ex, 'topic-minitest', t.id, own)
  }
  for (const s of situations.values()) for (const ex of s.exercises) addExercise(ex, 'situation', s.id, new Set([s.id]))
  for (const r of reading.values()) for (const ex of r.questions) addExercise(ex, 'reading', r.id, new Set([r.id]))
  for (const q of diagnostic.questions) addExercise(q, 'diagnostic', 'diagnostic', new Set())

  return {
    index: { syllabus, diagnostic, topics, situations, vocab, reading, tutor, modules, topicOrder, exercises },
    errors,
    warnings,
    missing,
  }
}

const stripPunct = (s: string) =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.,!?;:…«»"“”¿¡]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

/** Per-exercise internal consistency checks. Returns problems (empty = ok). */
export function checkExerciseSemantics(ex: Exercise): string[] {
  const out: string[] = []
  switch (ex.type) {
    case 'fill-gap':
      if (!ex.prompt.includes('___')) out.push('fill-gap prompt must contain "___"')
      break
    case 'choice':
    case 'listen-choice':
      if (ex.correct >= ex.options.length) out.push(`correct index ${ex.correct} out of range (${ex.options.length} options)`)
      if (new Set(ex.options).size !== ex.options.length) out.push('duplicate options')
      break
    case 'order-words': {
      // Every answer token must be among `words`; extra words are allowed (distractors).
      const pool = stripPunct(ex.words.join(' '))
      for (const tok of stripPunct(ex.answer)) {
        const i = pool.indexOf(tok)
        if (i === -1) {
          out.push(`order-words: answer token "${tok}" missing from words [${ex.words.join(', ')}]`)
          break
        }
        pool.splice(i, 1)
      }
      break
    }
    case 'match': {
      const lefts = ex.pairs.map((p) => p.left)
      if (new Set(lefts).size !== lefts.length) out.push('match: duplicate left items')
      break
    }
    default:
      break
  }
  return out
}
