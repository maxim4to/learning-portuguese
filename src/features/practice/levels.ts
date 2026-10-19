import { useSearchParams } from 'react-router-dom'
import { LEVELS, type Level } from '@/content'

export type LevelFilter = Level | 'all'

/** `?level=A2` filter shared by the «Практика» index pages (replace, so Back leaves the page). */
export function useLevelFilter(): [LevelFilter, (l: LevelFilter) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('level')
  const filter: LevelFilter = raw && (LEVELS as readonly string[]).includes(raw) ? (raw as Level) : 'all'
  return [filter, (l) => setParams(l === 'all' ? {} : { level: l }, { replace: true })]
}

export const levelRank = (l?: string) => (l ? LEVELS.indexOf(l as Level) : LEVELS.length)

/** Items grouped by CEFR level in course order; items without a level go last under `null`. */
export function groupByLevel<T extends { level?: string }>(items: T[], filter: LevelFilter) {
  const groups: { level: Level | null; items: T[] }[] = [
    ...LEVELS.map((level) => ({ level: level as Level | null, items: items.filter((i) => i.level === level) })),
    { level: null, items: items.filter((i) => !i.level || !(LEVELS as readonly string[]).includes(i.level)) },
  ]
  return groups.filter((g) => g.items.length > 0 && (filter === 'all' || g.level === filter))
}
