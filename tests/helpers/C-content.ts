/**
 * Workstream C: read-only access to the course content (content/**) from Playwright specs, so a test can answer
 * any exercise correctly (or deliberately wrong) without hard-coding answers. Only type imports from src/.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Diagnostic, Exercise, ReadingText, Situation, Syllabus, Topic, VocabTheme } from '../../src/content/schema.ts'

const ROOT = join(import.meta.dirname, '..', '..', 'content')
const json = <T>(...p: string[]): T => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8')) as T

export const topic = (id: string): Topic => json<Topic>('grammar', `${id}.json`)
export const situation = (id: string): Situation => json<Situation>('situations', `${id}.json`)
export const reading = (id: string): ReadingText => json<ReadingText>('reading', `${id}.json`)
export const vocabTheme = (id: string): VocabTheme => json<VocabTheme>('vocab', `${id}.json`)
export const diagnostic = (): Diagnostic => json<Diagnostic>('diagnostic.json')
export const syllabus = (): Syllabus => json<Syllabus>('syllabus.json')

const ids = (dir: string, ext = '.json') =>
  readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith(ext) && !f.startsWith('.'))
    .map((f) => f.slice(0, -ext.length))
export const situationIds = () => ids('situations')
export const readingIds = () => ids('reading')
export const vocabIds = () => ids('vocab')
export const cheatsheetIds = () => ids('cheatsheets', '.md')
export const topicIds = () => ids('grammar')

/** Every exercise the app can show (topics, situations, reading questions, diagnostic) by id. */
let all: Map<string, Exercise> | null = null
export function exerciseById(id: string): Exercise {
  if (!all) {
    all = new Map()
    for (const tid of topicIds()) {
      const t = topic(tid)
      for (const e of [...t.exercises, ...t.miniTest]) all.set(e.id, e)
    }
    for (const id of situationIds()) for (const e of situation(id).exercises) all.set(e.id, e)
    for (const id of readingIds()) for (const e of reading(id).questions) all.set(e.id, e)
    for (const q of diagnostic().questions) all.set(q.id, q as unknown as Exercise)
  }
  const e = all.get(id)
  if (!e) throw new Error(`exercise ${id} not found in content/`)
  return e
}

/**
 * A1 topic whose lesson has every exercise kind present in the content (fill-gap, choice, transform, order-words,
 * translate-ru-pt, listen-type, listen-choice, match). `speak-shadow` exists in the app but in no content file.
 */
export const ALL_KINDS_TOPIC = 'a1-presente-indicativo-regulares'
