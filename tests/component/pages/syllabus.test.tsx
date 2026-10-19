import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { getSyllabus, getTopic, listTopics } from '@/content'
import { SyllabusPage } from '@/features/syllabus/SyllabusPage'
import { progress, type Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'

const syl = getSyllabus()
const a1 = syl.levels.find((l) => l.level === 'A1')!
const a1Ids = a1.modules.flatMap((m) => m.topics)
const first = listTopics()[0]

const renderSyl = (route = '/syllabus', seed?: Seed) => renderWithProviders(<SyllabusPage />, { route, seed })
/** The course row link of a topic (accessible name contains its status). */
const row = (id: string) => screen.getAllByRole('link').find((l) => l.getAttribute('href') === `/topic/${id}` && l.closest('li'))!

describe('SyllabusPage', () => {
  test('all levels by default; «Все уровни» pressed; diagnostic action', () => {
    renderSyl()
    expect(screen.getByRole('heading', { level: 1, name: 'Курс' })).toBeInTheDocument()
    for (const l of syl.levels) expect(screen.getByRole('region', { name: `Уровень ${l.level}` })).toBeInTheDocument()
    const chips = screen.getByRole('group', { name: 'Уровень' })
    expect(within(chips).getByRole('button', { name: 'Все уровни' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('link', { name: /Диагностика/ })).toHaveAttribute('href', '/diagnostic')
  })

  test('level filter from the URL and from the chips (others hidden; bogus level → all)', async () => {
    const { user } = renderSyl('/syllabus?level=A2')
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Уровень A2'])
    await user.click(screen.getByRole('button', { name: 'B1' }))
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Уровень B1'])
    expect(screen.getByRole('button', { name: 'B1' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Все уровни' }))
    expect(screen.getAllByRole('region')).toHaveLength(syl.levels.length)
  })

  test('bogus ?level is ignored', () => {
    renderSyl('/syllabus?level=C9')
    expect(screen.getAllByRole('region')).toHaveLength(syl.levels.length)
  })

  test('rows: status in the accessible name, status dot colour, last result chip; prerequisites hint only when not started', () => {
    const [t0, t1, t2] = a1Ids
    renderSyl('/syllabus?level=A1', { progress: [progress(t0, 9, 10), progress(t1, 7, 10), progress(t2, 2, 10)] })
    expect(row(t0)).toHaveAccessibleName(new RegExp(`${getTopic(t0)!.title}.*Статус: Уверенно`))
    expect(row(t0)).toHaveTextContent('90%')
    expect(row(t0).querySelector('i')!.className).toContain('bg-brand')
    expect(row(t1)).toHaveAccessibleName(/Статус: Изучаю/)
    expect(row(t1).querySelector('i')!.className).toContain('bg-sun-fill')
    expect(row(t2)).toHaveAccessibleName(/Статус: Слабо/)
    expect(row(t2)).toHaveTextContent('20%')
    expect(row(t2).querySelector('i')!.className).toContain('bg-terracotta-fill')
    // A not-started topic whose requirements are not learned shows «Лучше сначала».
    const blocked = a1Ids.map((id) => getTopic(id)!).find((t) => t.requires.some((r) => ![t0, t1].includes(r)) && ![t0, t1, t2].includes(t.id))!
    expect(row(blocked.id)).toHaveTextContent('Лучше сначала:')
    expect(row(blocked.id)).toHaveAccessibleName(/Статус: Не начато/)
    expect(row(t2)).not.toHaveTextContent('Лучше сначала')
  })

  test('level header counts confident/total and draws the status bar; modules count started topics', () => {
    const [t0, t1] = a1Ids
    renderSyl('/syllabus?level=A1', { progress: [progress(t0, 9, 10), progress(t1, 4, 10)] })
    const region = screen.getByRole('region', { name: 'Уровень A1' })
    expect(within(region).getByText(`1/${a1Ids.length}`)).toBeInTheDocument()
    expect(within(region).getByRole('img', { name: `Уровень A1, тем ${a1Ids.length}; не начато ${a1Ids.length - 2}. Уверенно: 1, Изучаю: 0, Слабо: 1` })).toBeInTheDocument()
    const mod = a1.modules[0]
    const started = mod.topics.filter((t) => [t0, t1].includes(t)).length
    expect(within(region).getByRole('heading', { level: 3, name: mod.title }).parentElement).toHaveTextContent(`${started}/${mod.topics.length} начато`)
  })

  test('the «next» card: continue the course, or reinforce a weak topic', () => {
    const { unmount } = renderSyl()
    const card = () => screen.getAllByRole('link').find((l) => l.textContent?.includes('Продолжить курс') || l.textContent?.includes('Подтянуть слабую тему'))!
    expect(card()).toHaveTextContent(`${first.level}Продолжить курс${first.title}`)
    expect(card()).toHaveAttribute('href', `/topic/${first.id}`)
    unmount()
    // suggestTopics(…, 1) keeps room for a new topic: the weak card shows once every topic is started.
    renderSyl('/syllabus', { progress: listTopics().map((t) => progress(t.id, t.id === a1Ids[3] ? 3 : 10, 10)) })
    expect(card()).toHaveTextContent(`A1Подтянуть слабую тему${getTopic(a1Ids[3])!.title}`)
  })

  test('status legend lists all four statuses', () => {
    renderSyl()
    for (const s of ['Уверенно', 'Изучаю', 'Слабо', 'Не начато']) expect(screen.getAllByText(s).length).toBeGreaterThan(0)
  })
})
