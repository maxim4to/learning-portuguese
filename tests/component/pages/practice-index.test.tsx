import { render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import { configure } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'
import { listReadingTexts, listSituations, listVocabThemes } from '@/content'
import { listParsedCheatsheets } from '@/features/library/cheatsheets'
import { CheatsheetsPage } from '@/features/practice/CheatsheetsPage'
import { readingHref } from '@/features/practice/paths'
import { RedirectTo } from '@/features/practice/redirects'
import { ReadingIndexPage } from '@/features/practice/ReadingIndexPage'
import { VocabIndexPage } from '@/features/practice/VocabIndexPage'
import { SituationsPage } from '@/features/situations/SituationsPage'
import { progress, word, type Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'

// Whole-page renders (+ the lexicon chunk for «в словарь») are slow when the machine is busy.
vi.setConfig({ testTimeout: 20_000 })
configure({ asyncUtilTimeout: 4000 })

const render = (ui: React.ReactNode, route: string, seed?: Seed) => renderWithProviders(ui, { route, seed })
const groupHeadings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
const chips = () => screen.getByRole('group', { name: 'Фильтр по уровню' })

describe('PracticeHeader + SubNav', () => {
  test('h1 «Практика», sub-navigation with counts and the current section, document title', () => {
    render(<CheatsheetsPage />, '/practice/cheatsheets')
    expect(screen.getByRole('heading', { level: 1, name: 'Практика' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Разделы практики' })
    const current = within(nav).getByRole('link', { current: 'page' })
    expect(current).toHaveAttribute('href', '/practice/cheatsheets')
    expect(current).toHaveTextContent(`Шпаргалки${listParsedCheatsheets().length}`)
    expect(within(nav).getByRole('link', { name: /Ситуации/ })).toHaveTextContent(String(listSituations().length))
    expect(within(nav).getByRole('link', { name: /С агентом/ })).toHaveAttribute('href', '/practice/tutor')
    expect(document.title).toBe('Шпаргалки · Практика — Learning Portuguese')
  })
})

describe('CheatsheetsPage', () => {
  test('one card per sheet linking to it, with the number of sections', () => {
    render(<CheatsheetsPage />, '/practice/cheatsheets')
    const sheets = listParsedCheatsheets()
    const list = screen.getAllByRole('list').find((l) => l.querySelector('a[href^="/practice/cheatsheets/"]'))!
    const links = within(list).getAllByRole('link')
    expect(links).toHaveLength(sheets.length)
    expect(links[0]).toHaveAttribute('href', `/practice/cheatsheets/${sheets[0].id}`)
    expect(links[0]).toHaveTextContent(sheets[0].title)
    const sections = sheets[0].toc.filter((t) => t.level === 2).length
    expect(links[0]).toHaveTextContent(new RegExp(`${sections} раздел(а|ов)?`))
  })
})

describe('ReadingIndexPage', () => {
  const texts = listReadingTexts()

  test('counts, groups by level, status badge for started texts', () => {
    const a2 = texts.filter((t) => t.level === 'A2')
    render(<ReadingIndexPage />, '/practice/reading', { progress: [progress(a2[0].id, 9, 10), progress(a2[1].id, 5, 10)] })
    expect(screen.getByText(/Короткие тексты/)).toHaveTextContent(`${texts.length} текстов, уверенно 1.`)
    expect(groupHeadings()).toEqual(['A2', 'B1', 'B2'])
    const done = screen.getByRole('link', { name: new RegExp(a2[0].title) })
    expect(done).toHaveAttribute('href', `/practice/reading/${a2[0].id}`)
    expect(done).toHaveTextContent('Уверенно')
    expect(done).toHaveTextContent(/\d+ абзац(а|ев)? · \d+ слов(а|о)? в глоссарии · \d+ вопрос/)
    expect(screen.getByRole('link', { name: new RegExp(a2[1].title) })).toHaveTextContent('Слабо')
  })

  test('level chips: counts, filter via chips and ?level, empty level message', async () => {
    const { user } = render(<ReadingIndexPage />, '/practice/reading?level=B1')
    expect(groupHeadings()).toEqual(['B1'])
    expect(within(chips()).getByRole('button', { name: /^B1/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(chips()).getByRole('button', { name: /^Все/ })).toHaveTextContent(`Все${texts.length}`)
    await user.click(within(chips()).getByRole('button', { name: /^A1/ }))
    expect(screen.getByText('На уровне A1 текстов пока нет.')).toBeInTheDocument()
    await user.click(within(chips()).getByRole('button', { name: /^Все/ }))
    expect(groupHeadings()).toEqual(['A2', 'B1', 'B2'])
  })
})

describe('VocabIndexPage', () => {
  const themes = listVocabThemes()
  const words = themes.reduce((n, t) => n + t.words.length, 0)

  test('themes and words count, cards per theme, dictionary hint', () => {
    render(<VocabIndexPage />, '/practice/vocab')
    expect(screen.getByText(/Тематические словари/)).toHaveTextContent(`${themes.length} тем, ${words} слов`)
    const saude = themes.find((t) => t.id === 'saude')!
    const link = screen.getByRole('link', { name: new RegExp(saude.title) })
    expect(link).toHaveAttribute('href', '/practice/vocab/saude')
    expect(link).toHaveTextContent(new RegExp(`${saude.words.length}\\s?слов`))
    expect(link).toHaveTextContent(saude.titlePt!)
    expect(link).not.toHaveTextContent('в словаре')
    expect(screen.getByRole('link', { name: '«Мой словарь»' })).toHaveAttribute('href', '/words')
  })

  test('filter: B1 only; empty level message', async () => {
    const { user } = render(<VocabIndexPage />, '/practice/vocab')
    await user.click(within(chips()).getByRole('button', { name: /^B1/ }))
    expect(groupHeadings()).toEqual(['B1'])
    await user.click(within(chips()).getByRole('button', { name: /^B2/ }))
    expect(screen.getByText('На уровне B2 словарей пока нет.')).toBeInTheDocument()
  })

  test('with a dictionary: per-theme «в словаре N» once the lexicon is loaded, and the word count in the hint', async () => {
    render(<VocabIndexPage />, '/practice/vocab', { words: [word('saúde', 'здоровье')] })
    expect(screen.getByText(/Сохранённые слова/)).toHaveTextContent('(1 слово)')
    await waitFor(() => expect(screen.getAllByText(/в словаре \d+/)).toHaveLength(themes.length), { timeout: 10_000 })
  })
})

describe('SituationsPage', () => {
  const all = listSituations()

  test('count and started count, groups, status + best % only for started ones', () => {
    render(<SituationsPage />, '/practice/situations', { progress: [progress('no-cafe', 8, 10)] })
    expect(screen.getByText(/Диалоги из жизни/)).toHaveTextContent(`${all.length} ситуаций, начато 1.`)
    expect(groupHeadings()).toEqual(['A2', 'B1'])
    const cafe = screen.getByRole('link', { name: /В кафе/ })
    expect(cafe).toHaveAttribute('href', '/practice/situations/no-cafe')
    expect(cafe).toHaveTextContent('No café')
    expect(cafe).toHaveTextContent('Изучаю')
    expect(cafe).toHaveTextContent('80%')
    expect(cafe).toHaveTextContent(/15 реплик · 30 слов/)
    const other = screen.getByRole('link', { name: /Снять квартиру/ })
    expect(other).not.toHaveTextContent('Не начато')
  })

  test('level filter and empty level', async () => {
    const { user } = render(<SituationsPage />, '/practice/situations?level=A2')
    expect(groupHeadings()).toEqual(['A2'])
    await user.click(within(chips()).getByRole('button', { name: /^B2/ }))
    expect(screen.getByText('На уровне B2 ситуаций пока нет.')).toBeInTheDocument()
  })
})

describe('RedirectTo (old URLs)', () => {
  function Where() {
    const l = useLocation()
    return <output>{l.pathname + l.search + l.hash}</output>
  }
  test('maps params and keeps query and hash', () => {
    rtlRender(
      <MemoryRouter initialEntries={['/library/reading/a2-um-dia-em-lisboa?x=1#p-2']}>
        <Routes>
          <Route path="/library/reading/:id" element={<RedirectTo to={(p) => readingHref(p.id ?? '')} />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('/practice/reading/a2-um-dia-em-lisboa?x=1#p-2')
  })
})
