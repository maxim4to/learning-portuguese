/** Pure aggregations for the dashboard (no React). Days are local-time `YYYY-MM-DD`. */
import { getSyllabus, getTopic, listTopics, type Level, type Topic } from '@/content'
import type { ErrorEntry, SrsCard, TopicProgress, TopicStatus } from '@/data/types.ts'

export function dayKey(t: number | Date): string {
  const d = new Date(t)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function startOfDay(t: number = Date.now()): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function addDays(t: number, n: number): number {
  const d = new Date(t)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

/** Every day with any activity: topic results, card reviews, logged errors. */
export function activityDays(progress: Iterable<TopicProgress>, cards: SrsCard[], errors: ErrorEntry[] = []): Set<string> {
  const days = new Set<string>()
  for (const p of progress) {
    for (const r of p.history) days.add(dayKey(r.at))
    if (p.lastAt) days.add(dayKey(p.lastAt))
  }
  for (const c of cards) if (c.fsrs.last_review) days.add(dayKey(c.fsrs.last_review))
  for (const e of errors) days.add(dayKey(e.at))
  return days
}

/** Consecutive active days ending today (or yesterday, if nothing done yet today). */
export function computeStreak(days: Set<string>, now = Date.now()): { streak: number; activeToday: boolean } {
  const activeToday = days.has(dayKey(now))
  let t = activeToday ? now : addDays(now, -1)
  let streak = 0
  while (days.has(dayKey(t))) {
    streak++
    t = addDays(t, -1)
  }
  return { streak, activeToday }
}

export interface DayActivity {
  day: string
  /** Short weekday label (ru), e.g. "пн". */
  label: string
  /** Topic results (lessons, tests, diagnostic) recorded that day. */
  results: number
  /** Cards whose last review was that day. */
  reviews: number
  isToday: boolean
}

/** Last 7 days (oldest first). */
export function weeklyActivity(progress: Iterable<TopicProgress>, cards: SrsCard[], now = Date.now()): DayActivity[] {
  const fmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })
  const out: DayActivity[] = []
  const index = new Map<string, DayActivity>()
  for (let i = 6; i >= 0; i--) {
    const t = addDays(now, -i)
    const a: DayActivity = { day: dayKey(t), label: fmt.format(t), results: 0, reviews: 0, isToday: i === 0 }
    out.push(a)
    index.set(a.day, a)
  }
  for (const p of progress) for (const r of p.history) {
    const a = index.get(dayKey(r.at))
    if (a) a.results++
  }
  for (const c of cards) {
    if (!c.fsrs.last_review) continue
    const a = index.get(dayKey(c.fsrs.last_review))
    if (a) a.reviews++
  }
  return out
}

export type StatusCounts = Record<TopicStatus, number>

export interface LevelStats {
  level: Level
  /** Topics listed in the syllabus (including not yet written). */
  total: number
  /** Topics with content available. */
  available: number
  counts: StatusCounts
}

export function levelStats(progress: Map<string, TopicProgress>): LevelStats[] {
  return getSyllabus().levels.map((lvl) => {
    const counts: StatusCounts = { 'not-started': 0, weak: 0, learning: 0, confident: 0 }
    let total = 0
    let available = 0
    for (const mod of lvl.modules)
      for (const tid of mod.topics) {
        total++
        if (getTopic(tid)) available++
        counts[progress.get(tid)?.status ?? 'not-started']++
      }
    return { level: lvl.level, total, available, counts }
  })
}

export interface SuggestedTopic {
  topic: Topic
  reason: 'weak' | 'learning' | 'next'
  progress?: TopicProgress
}

/** Weakest started topics first (lowest last result), then the next unstarted topics in course order. */
export function suggestTopics(progress: Map<string, TopicProgress>, count = 2): SuggestedTopic[] {
  const topics = listTopics()
  const shaky = topics
    .map((topic) => ({ topic, progress: progress.get(topic.id) }))
    .filter((x) => x.progress && (x.progress.status === 'weak' || x.progress.status === 'learning'))
    .sort((a, b) => a.progress!.lastPct - b.progress!.lastPct)
    .map((x) => ({ ...x, reason: x.progress!.status as 'weak' | 'learning' }))
  const out: SuggestedTopic[] = shaky.slice(0, count)
  // Always leave room for one new topic when there is something to start.
  const next = topics.filter((t) => !progress.has(t.id))
  if (next.length && out.length >= count) out.length = Math.max(0, count - 1)
  for (const topic of next) {
    if (out.length >= count) break
    out.push({ topic, reason: 'next' })
  }
  return out
}
