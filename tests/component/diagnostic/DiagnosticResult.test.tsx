import { screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { getSyllabus } from '@/content'
import { DiagnosticResult } from '@/features/diagnostic/DiagnosticResult'
import { formatDate, topicTitle, type DiagnosticResultData, type TopicOutcome } from '@/features/diagnostic/plan'
import { NOW } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'

const a1 = getSyllabus().levels[0].modules.flatMap((m) => m.topics)
const a2 = getSyllabus().levels[1].modules.flatMap((m) => m.topics)

function data(entries: [string, TopicOutcome][], skippedLevels: DiagnosticResultData['skippedLevels'] = []): DiagnosticResultData {
  return { at: NOW, topics: new Map(entries), skippedLevels }
}

function show(d: DiagnosticResultData, p: { saving?: boolean; error?: string; note?: string } = {}) {
  const onRestart = vi.fn()
  const r = renderWithProviders(<DiagnosticResult data={d} heading="Результат диагностики" onRestart={onRestart} {...p} />)
  return { ...r, onRestart }
}

const routeSection = () => screen.getByRole('heading', { name: 'Рекомендуемый маршрут' }).closest('section')!

describe('DiagnosticResult', () => {
  test('heading, date, totals and green / yellow / red counters', () => {
    show(data([[a1[0], { correct: 2, total: 2 }], [a1[1], { correct: 1, total: 2 }], [a1[2], { correct: 0, total: 1 }]]))
    expect(screen.getByRole('heading', { level: 1, name: 'Результат диагностики' })).toBeInTheDocument()
    expect(screen.getByText(`${formatDate(NOW)} · верно 3 из 5`)).toBeInTheDocument()
    const counters = screen.getByText('Знаю', { selector: 'p' }).parentElement!.parentElement!
    expect(counters).toHaveTextContent('1Знаю1Есть пробелы1Нужно учить')
  })

  test('route: red topics first, then yellow, in syllabus order; green ones are not listed', () => {
    show(data([[a1[0], { correct: 1, total: 2 }], [a1[1], { correct: 0, total: 1 }], [a1[2], { correct: 1, total: 1 }], [a1[3], { correct: 0, total: 2 }]]))
    const links = within(routeSection()).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual([`/topic/${a1[1]}`, `/topic/${a1[3]}`, `/topic/${a1[0]}`])
    expect(links[0]).toHaveTextContent(`1.${topicTitle(a1[1])}A1`)
  })

  test('long route: 10 shown, «Показать все (n)» expands and «Свернуть» collapses', async () => {
    const ids = [...a1, ...a2].slice(0, 13)
    const { user } = show(data(ids.map((id) => [id, { correct: 0, total: 1 }])))
    expect(within(routeSection()).getAllByRole('link')).toHaveLength(10)
    const more = screen.getByRole('button', { name: 'Показать все (13)' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await user.click(more)
    expect(within(routeSection()).getAllByRole('link')).toHaveLength(13)
    await user.click(screen.getByRole('button', { name: 'Свернуть' }))
    expect(within(routeSection()).getAllByRole('link')).toHaveLength(10)
  })

  test('all green + stopped early → empty route text with «следующего уровня» and skipped levels', () => {
    show(data([[a1[0], { correct: 1, total: 1 }]], ['A2', 'B1']))
    expect(within(routeSection()).getByText(/Проверенные темы вы знаете уверенно.*Продолжайте курс со следующего уровня\./)).toBeInTheDocument()
    expect(screen.getByText('Не оценивались: A2, B1 — диагностика остановлена раньше.')).toBeInTheDocument()
    expect(screen.getAllByText('не оценивался')).toHaveLength(2)
  })

  test('topic map: only probed levels; chips show score and grade', () => {
    show(data([[a1[0], { correct: 1, total: 2 }]]))
    const map = screen.getByRole('heading', { name: 'Карта тем' }).closest('section')!
    const chip = within(map).getByRole('link', { name: new RegExp(topicTitle(a1[0])) })
    expect(chip).toHaveTextContent('1/2 · Есть пробелы')
    expect(within(map).getByRole('link', { name: new RegExp(topicTitle(a1[1])) })).toHaveTextContent('— · Не оценено')
    // B2 has no diagnostic questions → no B2 card.
    expect(within(map).queryByText('B2')).not.toBeInTheDocument()
    expect(within(map).getByText('A1')).toBeInTheDocument()
  })

  test('saving / error / note lines', () => {
    const a = show(data([]), { saving: true, note: 'hidden while saving' })
    expect(screen.getByText('Сохраняю…')).toBeInTheDocument()
    expect(screen.queryByText('hidden while saving')).not.toBeInTheDocument()
    a.unmount()
    show(data([]), { error: 'offline', note: 'Ошибки записаны' })
    expect(screen.getByText('Не удалось сохранить: offline')).toBeInTheDocument()
    expect(screen.getByText('Ошибки записаны')).toBeInTheDocument()
  })

  test('actions: «К курсу» link and «Пройти заново»', async () => {
    const { user, onRestart } = show(data([]))
    expect(screen.getAllByRole('link', { name: 'К курсу' }).at(-1)).toHaveAttribute('href', '/syllabus')
    await user.click(screen.getByRole('button', { name: 'Пройти заново' }))
    expect(onRestart).toHaveBeenCalled()
  })
})
