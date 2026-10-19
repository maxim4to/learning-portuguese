/**
 * «Что дальше» after a lesson run: the one logical next step and 2–3 recommended topics with a reason.
 * Pure (content order + progress map), so the end screen and tests share it. The weak-topic part reuses the
 * dashboard's «Дальше по курсу» ranking (`suggestTopics`).
 */
import { getTopic, listTopics, type Topic } from '@/content'
import type { TopicProgress, TopicStatus } from '@/data'
import { suggestTopics } from '@/features/dashboard/stats'

export type RecReason = 'prereq' | 'next' | 'weak' | 'related'

export interface TopicRec {
  topic: Topic
  reason: RecReason
  progress?: TopicProgress
}

export type NextStep =
  /** Work on the mistakes of this run (low result, nothing more basic to fix first). */
  | { kind: 'retry-wrong' }
  /** Same topic, the mini-test tab. */
  | { kind: 'mini-test' }
  /** Another topic: a prerequisite to shore up (low result) or the next one in course order. */
  | { kind: 'topic'; rec: TopicRec }
  /** Nothing left in the course. */
  | { kind: 'course' }

const solid = (s: TopicStatus | undefined) => s === 'confident' || s === 'learning'

/** Prerequisites of `topic` that aren't at least «Изучаю» (weakest first). */
export function unmetPrereqs(topic: Topic, progress: Map<string, TopicProgress>): TopicRec[] {
  return topic.requires
    .map((id) => getTopic(id))
    .filter((t): t is Topic => !!t && !solid(progress.get(t.id)?.status))
    .map((t) => ({ topic: t, reason: 'prereq' as const, progress: progress.get(t.id) }))
    .sort((a, b) => (a.progress?.lastPct ?? -1) - (b.progress?.lastPct ?? -1))
}

/** Topics after `topic` in course order that aren't confident yet; wraps to the start of the course. */
export function nextInOrder(topic: Topic, progress: Map<string, TopicProgress>): Topic[] {
  const all = listTopics()
  const at = all.findIndex((t) => t.id === topic.id)
  const after = [...all.slice(at + 1), ...all.slice(0, Math.max(0, at))]
  return after.filter((t) => progress.get(t.id)?.status !== 'confident')
}

export interface NextPlanInput {
  topic: Topic
  /** Progress of every topic, including this run's saved result. */
  progress: Map<string, TopicProgress>
  source: 'lesson' | 'mini-test'
  /** Ratio of this run, 0..1. */
  pct: number
  wrong: number
  retry: boolean
  hasMiniTest: boolean
}

export interface NextPlan {
  primary: NextStep
  recs: TopicRec[]
}

const LOW = 0.6

export function planNext(i: NextPlanInput): NextPlan {
  const { topic, progress } = i
  const prereqs = unmetPrereqs(topic, progress)
  const ahead = nextInOrder(topic, progress)
  const next: TopicRec | undefined = ahead[0] && { topic: ahead[0], reason: 'next', progress: progress.get(ahead[0].id) }
  const miniDone = !!progress.get(topic.id)?.history.some((r) => r.source === 'mini-test')

  let primary: NextStep
  const low = i.retry ? i.wrong > 0 : i.pct < LOW
  if (low && prereqs[0]) primary = { kind: 'topic', rec: prereqs[0] }
  else if (low && i.wrong > 0) primary = { kind: 'retry-wrong' }
  else if (i.source === 'lesson' && i.hasMiniTest && !miniDone) primary = { kind: 'mini-test' }
  else if (next) primary = { kind: 'topic', rec: next }
  else primary = { kind: 'course' }

  const weak: TopicRec[] = suggestTopics(progress, 6)
    .filter((s) => s.reason !== 'next')
    .map((s) => ({ topic: s.topic, reason: 'weak', progress: s.progress }))
  const related: TopicRec[] = listTopics()
    .filter((t) => t.module === topic.module && t.id !== topic.id && progress.get(t.id)?.status !== 'confident')
    .map((t) => ({ topic: t, reason: 'related', progress: progress.get(t.id) }))
  const later: TopicRec[] = ahead.slice(1, 3).map((t) => ({ topic: t, reason: 'next', progress: progress.get(t.id) }))

  const skip = new Set([topic.id])
  if (primary.kind === 'topic') skip.add(primary.rec.topic.id)
  const recs: TopicRec[] = []
  for (const r of [...prereqs, ...(next ? [next] : []), ...weak.slice(0, 1), ...related, ...later, ...weak.slice(1)]) {
    if (recs.length >= 3) break
    if (skip.has(r.topic.id)) continue
    skip.add(r.topic.id)
    recs.push(r)
  }
  return { primary, recs }
}

export function recReason(r: TopicRec): string {
  const was = r.progress ? ` · было ${Math.round(r.progress.lastPct * 100)}%` : ''
  switch (r.reason) {
    case 'prereq':
      return `Основа этой темы${was}`
    case 'next':
      return 'Следующая по курсу'
    case 'weak':
      return `Стоит повторить${was}`
    case 'related':
      return `Из того же раздела${was}`
  }
}
