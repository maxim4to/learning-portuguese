import { gradeAnswer } from '@/engine/grading'
import type { Submission } from './types'

/** Unify "a/b", "a / b" so multi-gap answers compare regardless of spacing. */
const unifySlashes = (s: string) => s.replace(/\s*\/\s*/g, ' / ')

/** Grades free text against accepted variants (via engine gradeAnswer). */
export function gradeTyped(given: string, accepted: readonly string[]): Submission {
  const r = gradeAnswer(unifySlashes(given), accepted.map(unifySlashes))
  const expected = accepted.find((a) => unifySlashes(a) === r.closest) ?? r.closest
  return { given, verdict: r.verdict, expected }
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
