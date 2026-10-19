/** Pure diagnostic logic: stages, per-topic outcomes, colours, recommended route. No React. */
import { LEVELS, getSyllabus, getTopic, type DiagnosticQuestion, type Level } from '@/content'
import type { TopicProgress } from '@/data/types.ts'
import type { AnswerRecord } from '@/features/exercises'

export interface Stage {
  level: Level
  questions: DiagnosticQuestion[]
}

/** Below this share of correct answers on a stage we offer to stop the diagnostic. */
export const STOP_THRESHOLD = 0.4

function shuffle<T>(items: readonly T[], rnd: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const hasAdjacentTopic = (qs: readonly DiagnosticQuestion[]) => qs.some((q, i) => i > 0 && qs[i - 1].topicId === q.topicId)

/** Random order where two questions of the same topic never stand next to each other (when possible). */
export function spreadShuffle(qs: readonly DiagnosticQuestion[], rnd: () => number = Math.random): DiagnosticQuestion[] {
  let best = shuffle(qs, rnd)
  for (let attempt = 0; attempt < 200 && hasAdjacentTopic(best); attempt++) best = shuffle(qs, rnd)
  if (!hasAdjacentTopic(best)) return best
  // Repair: rebuild the order picking, at each step, the topic with the most questions left that differs from the
  // previous one (ties → whichever comes first in the shuffled order). This finds a spread whenever one exists
  // (no topic holds more than ⌈n/2⌉ questions); otherwise the leftovers of the biggest topic end up adjacent.
  const queues = new Map<string, DiagnosticQuestion[]>()
  for (const q of best) {
    const list = queues.get(q.topicId)
    if (list) list.push(q)
    else queues.set(q.topicId, [q])
  }
  const out: DiagnosticQuestion[] = []
  while (out.length < best.length) {
    const prev = out[out.length - 1]?.topicId
    let pick: DiagnosticQuestion[] | undefined
    for (const [topic, list] of queues) {
      if (!list.length || topic === prev) continue
      if (!pick || list.length > pick.length) pick = list
    }
    pick ??= queues.get(prev!)!
    out.push(pick.shift()!)
  }
  return out
}

/** One stage per level (A1 → A2 → B1 …), questions shuffled inside the level. */
export function buildStages(questions: readonly DiagnosticQuestion[], rnd: () => number = Math.random): Stage[] {
  return LEVELS.map((level) => ({ level, questions: spreadShuffle(questions.filter((q) => q.level === level), rnd) })).filter(
    (s) => s.questions.length > 0,
  )
}

export interface TopicOutcome {
  correct: number
  total: number
}

/** Result of one diagnostic run (fresh or reconstructed from progress history). */
export interface DiagnosticResultData {
  at: number
  /** topicId → score on that topic's questions. */
  topics: Map<string, TopicOutcome>
  /** Levels the diagnostic had questions for but which were not assessed (stopped early). */
  skippedLevels: Level[]
}

export function outcomesFromAnswers(answers: readonly AnswerRecord[]): Map<string, TopicOutcome> {
  const m = new Map<string, TopicOutcome>()
  for (const a of answers) {
    const o = m.get(a.topicId) ?? { correct: 0, total: 0 }
    o.total++
    if (a.ok) o.correct++
    m.set(a.topicId, o)
  }
  return m
}

export type Grade = 'green' | 'yellow' | 'red' | 'none'

/** All correct → green, none → red, partly → yellow; not assessed → none. */
export function gradeOf(o: TopicOutcome | undefined): Grade {
  if (!o || o.total === 0) return 'none'
  if (o.correct >= o.total) return 'green'
  if (o.correct === 0) return 'red'
  return 'yellow'
}

export const GRADE_META: Record<Grade, { label: string; chip: string; dot: string }> = {
  green: {
    label: 'Знаю',
    chip: 'border-brand/30 bg-brand-soft text-brand-ink hover:border-brand',
    dot: 'bg-brand',
  },
  yellow: {
    label: 'Есть пробелы',
    chip: 'border-warning-line bg-sun-soft text-sun hover:border-sun',
    dot: 'bg-sun-fill',
  },
  red: {
    label: 'Нужно учить',
    chip: 'border-terracotta/30 bg-terracotta-soft text-terracotta hover:border-terracotta',
    dot: 'bg-terracotta-fill',
  },
  none: {
    label: 'Не оценено',
    chip: 'border-line bg-surface-2 text-ink-muted hover:border-line-strong',
    dot: 'bg-line-strong',
  },
}

/** Every syllabus topic id in study order. */
export function syllabusTopicIds(): string[] {
  return getSyllabus().levels.flatMap((l) => l.modules.flatMap((m) => m.topics))
}

/** Red topics first, then yellow — each group in syllabus order. */
export function recommendedRoute(topics: Map<string, TopicOutcome>): { id: string; grade: 'red' | 'yellow' }[] {
  const order = syllabusTopicIds()
  // Assessed topics missing from the syllabus go last.
  for (const id of topics.keys()) if (!order.includes(id)) order.push(id)
  const pick = (g: 'red' | 'yellow') => order.filter((id) => gradeOf(topics.get(id)) === g).map((id) => ({ id, grade: g }))
  return [...pick('red'), ...pick('yellow')]
}

export function countGrades(topics: Map<string, TopicOutcome>): Record<Exclude<Grade, 'none'>, number> {
  const c = { green: 0, yellow: 0, red: 0 }
  for (const o of topics.values()) {
    const g = gradeOf(o)
    if (g !== 'none') c[g]++
  }
  return c
}

/** Levels present in the diagnostic but without any assessed topic. */
export function skippedLevelsFor(questions: readonly DiagnosticQuestion[], topics: Map<string, TopicOutcome>): Level[] {
  return LEVELS.filter((lvl) => {
    const qs = questions.filter((q) => q.level === lvl)
    return qs.length > 0 && !qs.some((q) => topics.has(q.topicId))
  })
}

/** All results of one diagnostic share the same `at`; allow a little slack for safety. */
const SAME_RUN_MS = 60_000

/**
 * Rebuilds the last diagnostic result from progress history (entries with source 'diagnostic'
 * recorded at `settings.lastDiagnosticAt`). Returns undefined if nothing is found.
 */
export function lastResultFromHistory(
  lastAt: number | undefined,
  progress: Iterable<TopicProgress>,
  questions: readonly DiagnosticQuestion[],
): DiagnosticResultData | undefined {
  if (!lastAt) return undefined
  const topics = new Map<string, TopicOutcome>()
  for (const p of progress) {
    const r = [...p.history].reverse().find((h) => h.source === 'diagnostic' && Math.abs(h.at - lastAt) < SAME_RUN_MS)
    if (r) topics.set(p.topicId, { correct: r.correct, total: r.total })
  }
  if (topics.size === 0) return undefined
  return { at: lastAt, topics, skippedLevels: skippedLevelsFor(questions, topics) }
}

/** "a2-preterito-imperfeito" → "preterito imperfeito" (for topics not written yet). */
const humanizeId = (id: string) => id.replace(/^[ab][12]-/, '').replace(/-/g, ' ')
export const topicTitle = (id: string) => getTopic(id)?.title ?? humanizeId(id)

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
export const formatDate = (at: number) => dateFmt.format(new Date(at))
