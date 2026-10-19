/**
 * Zod schemas for all static learning content in `/content/**.json`.
 *
 * Pure module (no Vite/DOM APIs) — imported both by the app loader
 * (`src/content/index.ts`) and by Node scripts (`scripts/validate.ts`).
 *
 * Conventions:
 * - All objects are strict: unknown keys are a validation error (catches typos in content).
 * - Russian text lives in `title`, `ru`, `theory`, `hint`, `explanation`, `instruction` fields;
 *   Portuguese (pt-PT only!) in `pt`, `titlePt`, `prompt`, `answer`, `text`, `words`, `options`.
 */
import { z } from 'zod'

const nonEmpty = z.string().trim().min(1)
/** Identifier: lowercase latin, digits, dashes. E.g. `a1-ser-estar`. */
const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id must be kebab-case: a-z, 0-9, "-"')

export const LevelSchema = z.enum(['A1', 'A2', 'B1', 'B2'])
export type Level = z.infer<typeof LevelSchema>
export const LEVELS: readonly Level[] = LevelSchema.options

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

/**
 * Builds the list of exercise variants. `extra` lets us derive e.g. diagnostic
 * questions (exercise + `level`) while keeping every variant a strict object.
 */
function exerciseVariants<E extends z.ZodRawShape>(extra: E) {
  const base = {
    id,
    /** Topic the exercise trains (errors are attributed to it). For situation/reading
     *  exercises it may be the situation/reading id or a grammar topic id. */
    topicId: id,
    tags: z.array(nonEmpty).optional(),
    /** Optional explanation shown after answering (ru). */
    explanation: nonEmpty.optional(),
    ...extra,
  }
  return [
    /** Type the missing word(s). `prompt` contains `___` for each gap. */
    z.strictObject({
      ...base,
      type: z.literal('fill-gap'),
      prompt: nonEmpty,
      /** Accepted variants of the full gap filling (multiple gaps: "sou / estou"). */
      answer: z.array(nonEmpty).min(1),
      hint: nonEmpty.optional(),
      /** Russian translation of the sentence. */
      ru: nonEmpty.optional(),
    }),
    /** Multiple choice. `correct` is the 0-based index into `options`. */
    z.strictObject({
      ...base,
      type: z.literal('choice'),
      prompt: nonEmpty,
      options: z.array(nonEmpty).min(2),
      correct: z.number().int().min(0),
    }),
    /** Rewrite the sentence following `instruction` (ru), e.g. "поставь в pretérito perfeito". */
    z.strictObject({
      ...base,
      type: z.literal('transform'),
      prompt: nonEmpty,
      instruction: nonEmpty,
      answer: z.array(nonEmpty).min(1),
    }),
    /** Put shuffled `words` in order; `answer` is the full correct sentence.
     *  `words` may contain extra distractor words not used in `answer`. */
    z.strictObject({
      ...base,
      type: z.literal('order-words'),
      words: z.array(nonEmpty).min(2),
      answer: nonEmpty,
      ru: nonEmpty.optional(),
    }),
    /** Translate a Russian sentence into pt-PT. */
    z.strictObject({
      ...base,
      type: z.literal('translate-ru-pt'),
      ru: nonEmpty,
      answer: z.array(nonEmpty).min(1),
    }),
    /** Dictation: `text` is spoken, the learner types it. */
    z.strictObject({
      ...base,
      type: z.literal('listen-type'),
      text: nonEmpty,
      answer: z.array(nonEmpty).min(1),
    }),
    /** Listen to `text` and pick the correct option. */
    z.strictObject({
      ...base,
      type: z.literal('listen-choice'),
      text: nonEmpty,
      /** Optional question (ru or pt) shown above the options. */
      prompt: nonEmpty.optional(),
      options: z.array(nonEmpty).min(2),
      correct: z.number().int().min(0),
    }),
    /** Match left items to right items (pairs are given in correct order; UI shuffles). */
    z.strictObject({
      ...base,
      type: z.literal('match'),
      prompt: nonEmpty.optional(),
      pairs: z.array(z.strictObject({ left: nonEmpty, right: nonEmpty })).min(2),
    }),
    /** Shadowing: listen and repeat aloud. Not auto-graded. */
    z.strictObject({
      ...base,
      type: z.literal('speak-shadow'),
      text: nonEmpty,
      ru: nonEmpty.optional(),
    }),
  ] as const
}

export const ExerciseSchema = z.discriminatedUnion('type', exerciseVariants({}))
export type Exercise = z.infer<typeof ExerciseSchema>
export type ExerciseType = Exercise['type']
/** Narrow helper: `ExerciseOf<'choice'>`. */
export type ExerciseOf<T extends ExerciseType> = Extract<Exercise, { type: T }>
export const EXERCISE_TYPES: readonly ExerciseType[] = [
  'fill-gap',
  'choice',
  'transform',
  'order-words',
  'translate-ru-pt',
  'listen-type',
  'listen-choice',
  'match',
  'speak-shadow',
]

// ---------------------------------------------------------------------------
// Syllabus
// ---------------------------------------------------------------------------

export const SyllabusModuleSchema = z.strictObject({
  id,
  /** Russian title. */
  title: nonEmpty,
  /** Topic ids in study order. */
  topics: z.array(id),
})
export type SyllabusModule = z.infer<typeof SyllabusModuleSchema>

export const SyllabusLevelSchema = z.strictObject({
  level: LevelSchema,
  modules: z.array(SyllabusModuleSchema),
})
export type SyllabusLevel = z.infer<typeof SyllabusLevelSchema>

export const SyllabusSchema = z.strictObject({
  levels: z.array(SyllabusLevelSchema),
})
export type Syllabus = z.infer<typeof SyllabusSchema>

// ---------------------------------------------------------------------------
// Grammar topic
// ---------------------------------------------------------------------------

export const ExampleSchema = z.strictObject({
  pt: nonEmpty,
  ru: nonEmpty,
  /** true → pre-generated mp3 expected at /audio/<audioHash(pt)>.mp3 */
  audio: z.boolean().optional(),
})
export type Example = z.infer<typeof ExampleSchema>

export const TopicSchema = z.strictObject({
  id,
  level: LevelSchema,
  /** Syllabus module id this topic belongs to. */
  module: id,
  /** Russian title. */
  title: nonEmpty,
  /** Portuguese title. */
  titlePt: nonEmpty,
  /** Prerequisite topic ids. */
  requires: z.array(id),
  /** Markdown (ru with pt examples). */
  theory: nonEmpty,
  /** Markdown: pt-PT vs pt-BR differences. Excluded from the brazilianism linter. */
  ptVsBr: nonEmpty.optional(),
  /** Markdown: typical errors of Russian speakers. Excluded from the brazilianism linter. */
  commonErrors: nonEmpty.optional(),
  examples: z.array(ExampleSchema),
  exercises: z.array(ExerciseSchema),
  miniTest: z.array(ExerciseSchema),
})
export type Topic = z.infer<typeof TopicSchema>

// ---------------------------------------------------------------------------
// Situation
// ---------------------------------------------------------------------------

export const DialogueLineSchema = z.strictObject({
  speaker: z.enum(['A', 'B']),
  pt: nonEmpty,
  ru: nonEmpty,
})
export type DialogueLine = z.infer<typeof DialogueLineSchema>

export const PhraseSchema = z.strictObject({ pt: nonEmpty, ru: nonEmpty })
export type Phrase = z.infer<typeof PhraseSchema>

export const SituationVocabSchema = z.strictObject({
  pt: nonEmpty,
  ru: nonEmpty,
  example: nonEmpty.optional(),
})
export type SituationVocab = z.infer<typeof SituationVocabSchema>

export const WritingTaskSchema = z.strictObject({
  /** Task description (ru). */
  prompt: nonEmpty,
  /** Reference answer (pt-PT). */
  sample: nonEmpty,
  /** Self-check list (ru). */
  checklist: z.array(nonEmpty).min(1),
})
export type WritingTask = z.infer<typeof WritingTaskSchema>

export const SituationSchema = z.strictObject({
  id,
  title: nonEmpty,
  titlePt: nonEmpty,
  level: LevelSchema,
  dialogue: z.array(DialogueLineSchema),
  phrases: z.array(PhraseSchema),
  vocab: z.array(SituationVocabSchema),
  exercises: z.array(ExerciseSchema),
  writingTask: WritingTaskSchema.optional(),
})
export type Situation = z.infer<typeof SituationSchema>

// ---------------------------------------------------------------------------
// Vocabulary theme
// ---------------------------------------------------------------------------

export const VocabWordSchema = z.strictObject({
  pt: nonEmpty,
  ru: nonEmpty,
  /** m = masculino, f = feminino, mf = both. */
  gender: z.enum(['m', 'f', 'mf']).optional(),
  example: nonEmpty.optional(),
  audio: z.boolean().optional(),
})
export type VocabWord = z.infer<typeof VocabWordSchema>

export const VocabThemeSchema = z.strictObject({
  id,
  title: nonEmpty,
  titlePt: nonEmpty.optional(),
  level: LevelSchema.optional(),
  words: z.array(VocabWordSchema).min(1),
})
export type VocabTheme = z.infer<typeof VocabThemeSchema>

// ---------------------------------------------------------------------------
// Graded reading
// ---------------------------------------------------------------------------

export const ReadingTextSchema = z.strictObject({
  id,
  level: LevelSchema,
  title: nonEmpty,
  paragraphs: z.array(nonEmpty).min(1),
  glossary: z.array(z.strictObject({ word: nonEmpty, ru: nonEmpty })),
  questions: z.array(ExerciseSchema),
})
export type ReadingText = z.infer<typeof ReadingTextSchema>

// ---------------------------------------------------------------------------
// Tutor prompt overrides (content/tutor/<id>.json)
// ---------------------------------------------------------------------------

/**
 * Optional per-item additions to the «Практика с агентом» prompts. `id` = id of an existing
 * topic / situation / reading text / vocab theme.
 */
export const TutorNotesSchema = z.strictObject({
  id,
  /** Extra instructions for the AI tutor (ru), appended to every prompt of this item. */
  notes: nonEmpty.optional(),
  /** Extra exercise items (ru/pt) the tutor may use, appended to the task bank. */
  extraTasks: z.array(nonEmpty).optional(),
})
export type TutorNotes = z.infer<typeof TutorNotesSchema>

// ---------------------------------------------------------------------------
// Diagnostic
// ---------------------------------------------------------------------------

/** A diagnostic question = any exercise + the CEFR level it probes. `topicId` must be a grammar topic. */
export const DiagnosticQuestionSchema = z.discriminatedUnion(
  'type',
  exerciseVariants({ level: LevelSchema }),
)
export type DiagnosticQuestion = z.infer<typeof DiagnosticQuestionSchema>

export const DiagnosticSchema = z.strictObject({
  questions: z.array(DiagnosticQuestionSchema).min(1),
})
export type Diagnostic = z.infer<typeof DiagnosticSchema>
