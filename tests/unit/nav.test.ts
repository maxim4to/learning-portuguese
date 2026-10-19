/** app/nav.ts: which main nav item is active for a pathname (segment boundaries, legacy URLs, '/' exact). */
import { describe, expect, test } from 'vitest'
import { NAV_ITEMS, isNavActive } from '@/app/nav'

const active = (pathname: string) => NAV_ITEMS.filter((i) => isNavActive(i, pathname)).map((i) => i.to)

describe('isNavActive', () => {
  test.each([
    ['/', ['/']],
    ['/syllabus', ['/syllabus']],
    ['/topic/a1-ser-estar', ['/syllabus']],
    ['/diagnostic', ['/syllabus']],
    ['/review', ['/review']],
    ['/words', ['/review']],
    ['/words/u:casa', ['/review']],
    ['/practice/situations/no-cafe', ['/practice']],
    ['/situations', ['/practice']],
    ['/situation/no-cafe', ['/practice']],
    ['/library/cheatsheets', ['/practice']],
    ['/tutor', ['/practice']],
    ['/settings', ['/settings']],
    ['/nope', []],
    ['/syllabusx', []],
    ['/topics', []],
    ['', []],
  ])('%s → %j', (path, items) => {
    expect(active(path)).toEqual(items)
  })

  test('/situation does not match /situations-like prefixes; trailing slashes in match are ignored', () => {
    expect(isNavActive({ to: '/x', label: 'x', match: ['/situation'] }, '/situationsfoo')).toBe(false)
    expect(isNavActive({ to: '/x/', label: 'x' }, '/x/y')).toBe(true)
    expect(isNavActive({ to: '/', label: 'home' }, '/anything')).toBe(false)
  })

  test('exactly one item is active on every main route', () => {
    for (const i of NAV_ITEMS) expect(active(i.to)).toEqual([i.to])
  })
})
