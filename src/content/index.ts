/**
 * Runtime content loader. All JSON under /content is bundled at build time
 * (eager glob), validated with zod once at startup; invalid content throws.
 */
import { buildContentIndex, type ContentIndex, type ExerciseLocation } from './build.ts'
import type {
  Diagnostic,
  Level,
  ReadingText,
  Situation,
  Syllabus,
  SyllabusModule,
  Topic,
  TutorNotes,
  VocabTheme,
} from './schema.ts'

export * from './schema.ts'
export type { ContentIndex, ExerciseLocation, ExerciseOwnerKind } from './build.ts'

// content/lexicon/** is compiled separately (npm run lexicon -- build) and loaded lazily — keep it out of the main bundle.
const jsonFiles = import.meta.glob(['/content/**/*.json', '!/content/lexicon/**'], { eager: true, import: 'default' })
const cheatsheetFiles = import.meta.glob('/content/cheatsheets/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

export class ContentValidationError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super(`Content validation failed (${problems.length} problem(s)):\n- ${problems.join('\n- ')}`)
    this.name = 'ContentValidationError'
    this.problems = problems
  }
}

const built = buildContentIndex(jsonFiles)
if (built.errors.length) throw new ContentValidationError(built.errors)
const softProblems = [...built.missing, ...built.warnings]
if (softProblems.length && import.meta.env.DEV) console.warn('[content] warnings:\n' + softProblems.join('\n'))

const index: ContentIndex = built.index

/** Raw index (maps). Prefer the accessor functions below. */
export function getContentIndex(): ContentIndex {
  return index
}

// --- Syllabus ---------------------------------------------------------------

export function getSyllabus(): Syllabus {
  return index.syllabus
}

export function getModule(moduleId: string): { level: Level; module: SyllabusModule } | undefined {
  return index.modules.get(moduleId)
}

// --- Grammar topics ---------------------------------------------------------

export function getTopic(id: string): Topic | undefined {
  return index.topics.get(id)
}

/** All topics in syllabus order (unlisted topics last). */
export function listTopics(): Topic[] {
  return index.topicOrder.map((id) => index.topics.get(id)!)
}

export function listTopicsByLevel(level: Level): Topic[] {
  return listTopics().filter((t) => t.level === level)
}

// --- Situations -------------------------------------------------------------

export function getSituation(id: string): Situation | undefined {
  return index.situations.get(id)
}

export function listSituations(): Situation[] {
  return [...index.situations.values()]
}

// --- Vocab ------------------------------------------------------------------

export function getVocabTheme(id: string): VocabTheme | undefined {
  return index.vocab.get(id)
}

export function listVocabThemes(): VocabTheme[] {
  return [...index.vocab.values()]
}

// --- Reading ----------------------------------------------------------------

export function getReadingText(id: string): ReadingText | undefined {
  return index.reading.get(id)
}

export function listReadingTexts(): ReadingText[] {
  return [...index.reading.values()]
}

// --- Tutor prompt overrides -------------------------------------------------

/** Optional additions for «Практика с агентом» prompts (content/tutor/<id>.json). */
export function getTutorNotes(id: string): TutorNotes | undefined {
  return index.tutor.get(id)
}

// --- Diagnostic -------------------------------------------------------------

export function getDiagnostic(): Diagnostic {
  return index.diagnostic
}

// --- Exercises --------------------------------------------------------------

/** Find any exercise (topic, mini-test, situation, reading, diagnostic) by id. */
export function findExercise(id: string): ExerciseLocation | undefined {
  return index.exercises.get(id)
}

// --- Cheat-sheets (markdown) -------------------------------------------------

export interface Cheatsheet {
  id: string
  markdown: string
}

export function listCheatsheets(): Cheatsheet[] {
  return Object.entries(cheatsheetFiles).map(([path, markdown]) => ({
    id: path.split('/').pop()!.replace(/\.md$/, ''),
    markdown,
  }))
}

export function getCheatsheet(id: string): Cheatsheet | undefined {
  return listCheatsheets().find((c) => c.id === id)
}
