/**
 * Workstream E: every route of the app with a seed that gives each page real content (a11y, overflow, budgets).
 */
import { NOW, DAY, card, errorEntry, fsrs, progress, word, wordCard, type Seed } from '../fixtures/seed'

export interface RouteCase {
  name: string
  /** Router path (relative to the base). */
  path: string
}

export const ROUTES: RouteCase[] = [
  { name: 'home', path: '/' },
  { name: 'syllabus', path: '/syllabus' },
  { name: 'topic theory', path: '/topic/a1-ser-estar' },
  { name: 'topic examples', path: '/topic/a1-ser-estar?tab=examples' },
  { name: 'topic exercises', path: '/topic/a1-ser-estar?tab=exercises' },
  { name: 'topic mini-test', path: '/topic/a1-ser-estar?tab=mini-test' },
  { name: 'topic tutor', path: '/topic/a1-ser-estar?tab=tutor' },
  { name: 'diagnostic', path: '/diagnostic' },
  { name: 'review', path: '/review' },
  { name: 'review all cards', path: '/review?tab=all' },
  { name: 'words', path: '/words' },
  { name: 'word page', path: '/words/u%3Acasa' },
  { name: 'situations', path: '/practice/situations' },
  { name: 'situation', path: '/practice/situations/no-cafe' },
  { name: 'cheatsheets', path: '/practice/cheatsheets' },
  { name: 'cheatsheet', path: '/practice/cheatsheets/conectores' },
  { name: 'vocab', path: '/practice/vocab' },
  { name: 'vocab theme', path: '/practice/vocab/saude' },
  { name: 'reading', path: '/practice/reading' },
  { name: 'reading text', path: '/practice/reading/a2-a-minha-rotina' },
  { name: 'tutor', path: '/practice/tutor' },
  { name: 'settings', path: '/settings' },
  { name: '404', path: '/no-such-page' },
]

const casa = word('casa', 'дом')
const falar = word('falar', 'говорить', { modes: ['recognize', 'produce'] })

/** A learner with some history: progress in A1, due cards, two dictionary words, an error log. */
export const RICH_SEED: Seed = {
  progress: [progress('a1-ser-estar', 9, 10), progress('a1-artigos-genero-numero', 5, 10), progress('a1-ter-haver', 7, 10, { at: NOW - 3 * DAY })],
  cards: [card('err-1'), card('err-2', { fsrs: fsrs({ due: NOW + 3 * DAY }) }), wordCard(casa), wordCard(falar), wordCard(falar, 'produce')],
  words: [casa, falar],
  errors: [errorEntry('e1'), errorEntry('e2', { at: NOW - 2 * DAY })],
}
