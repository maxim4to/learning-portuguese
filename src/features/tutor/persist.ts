/**
 * «Практика с агентом»: recording completed sessions as `TopicResult`s with `source: 'tutor'`
 * (so the usual status pipeline — syllabus map, dashboard, streak — picks them up) and reading
 * the tutor history back from progress.
 */
import type { ProgressRepository, TopicProgress, TopicResult } from '@/data'

export type Assessment = 'easy' | 'ok' | 'hard'

export const ASSESSMENTS: { id: Assessment; label: string; score: [number, number] }[] = [
  { id: 'easy', label: 'Легко', score: [10, 10] },
  { id: 'ok', label: 'Нормально', score: [7, 10] },
  { id: 'hard', label: 'Сложно', score: [4, 10] },
]

/** Same thresholds as the prompts' «Оценка» and `statusFromPct`. */
export function assessmentFromPct(pct: number): Assessment {
  return pct >= 0.85 ? 'easy' : pct >= 0.6 ? 'ok' : 'hard'
}

/**
 * Finds the agent's summary score in a pasted note: «Итог: 8/10 · …» (also «8 из 10»).
 * Returns undefined when there is none or it is implausible.
 */
export function parseScore(note: string): { correct: number; total: number } | undefined {
  const m = /итог\s*[:—-]?\s*(\d{1,3})\s*(?:\/|из)\s*(\d{1,3})/i.exec(note)
  if (!m) return undefined
  const correct = Number(m[1])
  const total = Number(m[2])
  if (!total || correct > total) return undefined
  return { correct, total }
}

export interface TutorSessionInput {
  /** Progress ids credited (topic / situation / reading / vocab ids). */
  targetIds: string[]
  mode: string
  assessment: Assessment
  note?: string
}

/**
 * Score for a session: the agent's «Итог: N/M» from the note when it agrees with the chosen
 * self-assessment band, otherwise the self-assessment (Легко 10/10, Нормально 7/10, Сложно 4/10).
 */
export function sessionScore(assessment: Assessment, note?: string): { correct: number; total: number; fromNote: boolean } {
  const parsed = note ? parseScore(note) : undefined
  if (parsed && assessmentFromPct(parsed.correct / parsed.total) === assessment) return { ...parsed, fromNote: true }
  const [correct, total] = ASSESSMENTS.find((a) => a.id === assessment)!.score
  return { correct, total, fromNote: false }
}

export async function saveTutorSession(repo: ProgressRepository, input: TutorSessionInput): Promise<TopicProgress[]> {
  const at = Date.now()
  const note = input.note?.trim() ? input.note.trim().slice(0, 1000) : undefined
  const { correct, total } = sessionScore(input.assessment, note)
  const out: TopicProgress[] = []
  for (const topicId of input.targetIds) {
    const r: TopicResult = { topicId, correct, total, at, source: 'tutor', mode: input.mode }
    if (note) r.note = note
    out.push(await repo.saveTopicResult(r))
  }
  return out
}

export interface TutorHistoryEntry {
  at: number
  mode?: string
  note?: string
  correct: number
  total: number
  /** All items credited by this session (several for «Беседа дня»). */
  itemIds: string[]
}

/** Tutor sessions from progress histories, newest first; one entry per session (grouped by time + mode). */
export function tutorHistory(progress: Iterable<TopicProgress>): TutorHistoryEntry[] {
  const byKey = new Map<string, TutorHistoryEntry>()
  for (const p of progress)
    for (const r of p.history) {
      if (r.source !== 'tutor') continue
      const key = `${r.at}:${r.mode ?? ''}`
      const e = byKey.get(key)
      if (e) {
        if (!e.itemIds.includes(r.topicId)) e.itemIds.push(r.topicId)
      } else byKey.set(key, { at: r.at, mode: r.mode, note: r.note, correct: r.correct, total: r.total, itemIds: [r.topicId] })
    }
  return [...byKey.values()].sort((a, b) => b.at - a.at)
}
