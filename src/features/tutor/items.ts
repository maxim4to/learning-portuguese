/** Content lookups for «Практика с агентом» (runtime: uses the bundled content index). */
import {
  getReadingText,
  getSituation,
  getTopic,
  getVocabTheme,
  listSituations,
  listTopics,
  LEVELS,
  type Situation,
  type Topic,
} from '@/content'
import type { TopicProgress } from '@/data'
import type { TutorKind } from './modes'
import type { DailyPick } from './prompts'
import { readingHref, situationHref, vocabHref } from '@/features/practice/paths'

export interface TutorItemRef {
  id: string
  kind: Exclude<TutorKind, 'daily'>
  title: string
  /** Link to the item's «Практика с агентом» section. */
  to: string
}

/** Progress id of «Мои слова» sessions (the personal dictionary as a tutor item). */
export const MY_WORDS_ID = 'my-words'

/** Resolves any progress id (topic / situation / reading / vocab / «Мой словарь») to a title + link. */
export function resolveTutorItem(id: string): TutorItemRef | undefined {
  if (id === MY_WORDS_ID) return { id, kind: 'words', title: 'Мой словарь', to: '/words#tutor' }
  const t = getTopic(id)
  if (t) return { id, kind: 'topic', title: t.title, to: `/topic/${id}?tab=tutor` }
  const s = getSituation(id)
  if (s) return { id, kind: 'situation', title: s.title, to: `${situationHref(id)}?tab=tutor` }
  const r = getReadingText(id)
  if (r) return { id, kind: 'reading', title: r.title, to: `${readingHref(id)}#tutor` }
  const v = getVocabTheme(id)
  if (v) return { id, kind: 'vocab', title: v.title, to: `${vocabHref(id)}#tutor` }
  return undefined
}

const DAY = 86_400_000
const levelRank = (l: string) => LEVELS.indexOf(l as (typeof LEVELS)[number])

/** Weak/learning topics, weakest first. */
export function shakyTopics(progress: Map<string, TopicProgress>): { topic: Topic; progress: TopicProgress }[] {
  return listTopics()
    .map((topic) => ({ topic, progress: progress.get(topic.id)! }))
    .filter((x) => x.progress && (x.progress.status === 'weak' || x.progress.status === 'learning'))
    .sort((a, b) => a.progress.lastPct - b.progress.lastPct)
}

/** Next unstarted topics in course order. */
export function nextTopics(progress: Map<string, TopicProgress>, n: number): Topic[] {
  return listTopics()
    .filter((t) => !progress.has(t.id))
    .slice(0, n)
}

/** Situations to practise: unstarted / weak first (easier levels first), then the least recently practised. */
export function suggestedSituations(progress: Map<string, TopicProgress>, n: number, maxLevel?: string): Situation[] {
  const max = maxLevel ? levelRank(maxLevel) : LEVELS.length
  const score = (s: Situation) => {
    const p = progress.get(s.id)
    if (!p) return 0
    if (p.status === 'weak') return 1
    if (p.status === 'learning') return 2
    return 3
  }
  return listSituations()
    .filter((s) => levelRank(s.level) <= max)
    .sort(
      (a, b) =>
        score(a) - score(b) ||
        levelRank(a.level) - levelRank(b.level) ||
        (progress.get(a.id)?.lastAt ?? 0) - (progress.get(b.id)?.lastAt ?? 0) ||
        a.title.localeCompare(b.title, 'ru'),
    )
    .slice(0, n)
}

/**
 * «Беседа дня»: up to 2 weakest topics (or the next unstarted one) + one situation.
 * The situation rotates daily among the top candidates so the session isn't identical every day.
 */
export function pickDaily(progress: Map<string, TopicProgress>, now = Date.now()): DailyPick {
  const shaky = shakyTopics(progress)
    .slice(0, 2)
    .map((x) => x.topic)
  const topics = shaky.length ? shaky : nextTopics(progress, 1)
  const maxLevel = topics.reduce<string | undefined>(
    (m, t) => (m === undefined || levelRank(t.level) > levelRank(m) ? t.level : m),
    undefined,
  )
  const candidates = suggestedSituations(progress, 4, maxLevel && levelRank(maxLevel) < 1 ? 'A2' : maxLevel)
  const day = Math.floor(now / DAY)
  const situation = candidates.length ? candidates[day % candidates.length] : undefined
  return { topics, situation }
}
