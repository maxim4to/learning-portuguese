import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { configure } from '@testing-library/react'
import { useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { setThemePref } from '@/app/theme'
import { DEFAULT_SETTINGS, type ExportBundle } from '@/data/types'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { card, progress, NOW, DAY, errorEntry, word } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'

// Whole-page renders (+ the lexicon chunk for «в словарь») are slow when the machine is busy.
vi.setConfig({ testTimeout: 20_000 })
configure({ asyncUtilTimeout: 4000 })

const audio = vi.hoisted(() => ({ speak: null as unknown as ReturnType<typeof import('vitest').vi.fn> }))
vi.mock('@/engine/audio', async (orig) => {
  const real = await orig<typeof import('@/engine/audio')>()
  const { vi: v } = await import('vitest')
  audio.speak = v.fn(async () => ({ source: 'file' }))
  return {
    ...real,
    speak: audio.speak,
    stopSpeaking: v.fn(),
    getPtPtVoices: v.fn(async () => [{ name: 'Joana', lang: 'pt-PT' }]),
    pickPtPtVoice: v.fn(async () => ({ name: 'Joana', lang: 'pt-PT' })),
  }
})

function Loc() {
  return <output data-testid="loc">{useLocation().pathname}</output>
}

const storedSettings = () => JSON.parse(localStorage.getItem('ptpt:v1:settings') ?? '{}') as Record<string, unknown>

function renderSettings(seed?: Parameters<typeof renderWithProviders>[1] extends infer O ? (O extends { seed?: infer S } ? S : never) : never) {
  return renderWithProviders(
    <>
      <SettingsPage />
      <Loc />
    </>,
    { route: '/settings', seed },
  )
}

afterEach(() => {
  setThemePref('system')
})

describe('SettingsPage: preferences persist to the store', () => {
  test('theme segmented control writes ptpt:v1:theme and toggles html.dark', async () => {
    const { user } = renderSettings()
    const group = screen.getByRole('radiogroup', { name: 'Тема оформления' })
    expect(within(group).getByRole('radio', { name: 'Как в системе' })).toBeChecked()
    await user.click(within(group).getByRole('radio', { name: /Тёмная/ }))
    expect(localStorage.getItem('ptpt:v1:theme')).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
    await user.click(within(group).getByRole('radio', { name: /Светлая/ }))
    expect(localStorage.getItem('ptpt:v1:theme')).toBe('light')
    expect(document.documentElement).not.toHaveClass('dark')
    await user.click(within(group).getByRole('radio', { name: 'Как в системе' }))
    expect(localStorage.getItem('ptpt:v1:theme')).toBeNull()
  })

  test('voice, speed (quick pick + slider), sample playback and voice info', async () => {
    const { user, store } = renderSettings()
    expect(await screen.findByText(/Голос браузера для запасного синтеза: Joana/)).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Мужской' }))
    await waitFor(() => expect(store.settings().voice).toBe('male'))
    expect(storedSettings().voice).toBe('male')

    await user.click(screen.getByRole('radio', { name: '0,75×' }))
    expect(screen.getByText('Скорость: 0,75×')).toBeInTheDocument()
    await waitFor(() => expect(store.settings().rate).toBe(0.75))

    const slider = screen.getByRole('slider', { name: /Скорость/ })
    fireEvent.change(slider, { target: { value: '1.15' } })
    expect(slider).toHaveAttribute('aria-valuetext', '1,15×')
    // 1.15 is not a quick pick: no segment checked
    expect(within(screen.getByRole('radiogroup', { name: 'Быстрый выбор скорости' })).queryByRole('radio', { checked: true })).toBeNull()
    await waitFor(() => expect(storedSettings().rate).toBe(1.15))

    await user.click(screen.getByRole('button', { name: 'Прослушать' }))
    expect(audio.speak).toHaveBeenCalledWith(expect.stringContaining('Bom dia'), { voice: 'male', rate: 1.15 })
  })

  test('learning and dictionary switches persist', async () => {
    const { user, store } = renderSettings()
    const sw = (name: RegExp) => screen.getByRole('switch', { name })
    expect(sw(/акцентах/)).not.toBeChecked()
    await user.click(sw(/акцентах/))
    await user.click(sw(/Перевод по нажатию/))
    await user.click(sw(/Вводить ответ/))
    await user.click(sw(/Подсвечивать мои слова/))
    expect(sw(/акцентах/)).toBeChecked()
    await waitFor(() =>
      expect(store.settings()).toMatchObject({ lenientAccents: true, lookupOnTap: false, typeWordAnswers: false, highlightSavedWords: false }),
    )
    expect(storedSettings()).toMatchObject({ lenientAccents: true, lookupOnTap: false, typeWordAnswers: false, highlightSavedWords: false })
  })

  test('new cards per day: slider and the number field (clamped to 0..200)', async () => {
    const { store } = renderSettings()
    const slider = screen.getByRole('slider', { name: 'Новых карточек в день' })
    fireEvent.change(slider, { target: { value: '25' } })
    await waitFor(() => expect(store.settings().newCardsPerDay).toBe(25))
    const num = screen.getByRole('spinbutton', { name: 'Новых карточек в день, число' })
    fireEvent.change(num, { target: { value: '500' } })
    expect(num).toHaveValue(200)
    expect(slider).toHaveValue('50') // the slider stops at 50
    fireEvent.change(num, { target: { value: '-4' } })
    expect(num).toHaveValue(0)
    await waitFor(() => expect(store.settings().newCardsPerDay).toBe(0))
  })

  test('card modes: switching one off saves and reports suspension; the last one cannot be switched off', async () => {
    const { user, store } = renderSettings({ settings: { wordModes: ['recognize', 'produce'] } })
    const group = screen.getByRole('group', { name: 'Виды карточек слова' })
    const boxes = within(group).getAllByRole('checkbox')
    const checked = boxes.filter((b) => (b as HTMLInputElement).checked)
    expect(checked).toHaveLength(2)
    await user.click(checked[1])
    expect(await screen.findByText(/приостановлены, прогресс сохранён/)).toBeInTheDocument()
    await waitFor(() => expect(store.settings().wordModes).toEqual(['recognize']))
    expect(checked[0]).toBeDisabled()
    expect(within(group).getByText('хотя бы один вид остаётся включённым')).toBeInTheDocument()
    await user.click(checked[1])
    expect(await screen.findByText(/снова в повторении/)).toBeInTheDocument()
  })

  test('a change still waiting for the 400 ms debounce is written when the page unmounts', async () => {
    const { user, store, unmount } = renderSettings()
    await user.click(screen.getByRole('switch', { name: /акцентах/ }))
    unmount()
    await waitFor(() => expect(store.settings().lenientAccents).toBe(true))
    expect(storedSettings().lenientAccents).toBe(true)
  })

  // WCAG 2.5.3 Label in Name (A): the visible text must be part of the accessible name (voice control: «нажми Авто»).
  test.fails('theme «Авто» segment: accessible name contains its visible label [BUG B-61]', () => {
    renderSettings()
    const auto = within(screen.getByRole('radiogroup', { name: 'Тема оформления' })).getAllByRole('radio')[0]
    expect(auto).toHaveTextContent('Авто')
    expect(auto).toHaveAccessibleName(expect.stringContaining('Авто'))
  })

  test('last diagnostic date is shown', () => {
    renderSettings({ settings: { lastDiagnosticAt: NOW } })
    expect(screen.getByText(`Последняя диагностика: ${new Date(NOW).toLocaleDateString('ru-RU')}`)).toBeInTheDocument()
  })
})

describe('SettingsPage: storage, backup and danger zone', () => {
  test('local mode: storage explanation and developer details', () => {
    renderSettings()
    expect(screen.getByText('Прогресс хранится на этом устройстве')).toBeInTheDocument()
    expect(screen.getByText(/Хранилище:/)).toHaveTextContent('Хранилище: local · Firebase не настроен')
    expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument()
  })

  describe('export', () => {
    let blobs: Blob[]
    let clicked: HTMLAnchorElement[]
    beforeEach(() => {
      blobs = []
      clicked = []
      URL.createObjectURL = vi.fn((b: Blob) => {
        blobs.push(b)
        return 'blob:test/1'
      })
      URL.revokeObjectURL = vi.fn()
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this)
      })
    })
    afterEach(() => {
      vi.restoreAllMocks()
    })

    test('«Сохранить копию» downloads a JSON bundle of everything', async () => {
      const { user } = renderSettings({ progress: [progress('a1-ser-estar', 9)], cards: [card('c1')], settings: { voice: 'male' } })
      await user.click(screen.getByRole('button', { name: 'Сохранить копию' }))
      await waitFor(() => expect(clicked).toHaveLength(1))
      expect(clicked[0].download).toMatch(/^portugues-pt-\d{4}-\d{2}-\d{2}\.json$/)
      expect(clicked[0].href).toBe('blob:test/1')
      const bundle = JSON.parse(await blobs[0].text()) as ExportBundle
      expect(bundle.app).toBe('portugues-pt')
      expect(bundle.progress.map((p) => p.topicId)).toEqual(['a1-ser-estar'])
      expect(bundle.cards.map((c) => c.id)).toEqual(['c1'])
      expect(bundle.settings.voice).toBe('male')
    })
  })

  test('import: confirm → merged into the store, settings replaced', async () => {
    const { user, store, container } = renderSettings({ progress: [progress('a1-ser-estar', 5)] })
    const bundle: ExportBundle = {
      app: 'portugues-pt',
      version: 1,
      exportedAt: NOW,
      progress: [progress('a1-ter-haver', 9)],
      cards: [card('imp-1')],
      errors: [errorEntry('e1')],
      settings: { ...DEFAULT_SETTINGS, rate: 1.25, newCardsPerDay: 7 },
      words: [word('casa', 'дом')],
    }
    const file = new File([JSON.stringify(bundle)], 'backup.json', { type: 'application/json' })
    await user.upload(container.querySelector('input[type=file]') as HTMLInputElement, file)
    const confirm = screen.getByRole('alertdialog', { name: 'Восстановить из «backup.json»?' })
    // (autoFocus on «Отмена» is not asserted: user.upload moves focus around the hidden file input afterwards.)
    await user.click(within(confirm).getByRole('button', { name: 'Восстановить' }))
    expect(await screen.findByText('Импорт выполнен')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Восстановить из файла/ })).toHaveFocus()
    expect([...store.progressMap().keys()].sort()).toEqual(['a1-ser-estar', 'a1-ter-haver'])
    expect(store.cardList().map((c) => c.id)).toEqual(['imp-1'])
    expect(store.settings()).toMatchObject({ rate: 1.25, newCardsPerDay: 7 })
    expect(screen.getByRole('spinbutton', { name: /число/ })).toHaveValue(7)
  })

  test('import of a broken / foreign file reports the error and changes nothing', async () => {
    const { user, store, container } = renderSettings({ progress: [progress('a1-ser-estar', 5)] })
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    await user.upload(input, new File(['{not json'], 'broken.json', { type: 'application/json' }))
    await user.click(screen.getByRole('button', { name: 'Восстановить' }))
    expect(await screen.findByText(/^Ошибка импорта:/)).toBeInTheDocument()
    await user.upload(input, new File([JSON.stringify({ app: 'other', version: 1 })], 'other.json', { type: 'application/json' }))
    expect(screen.queryByText(/^Ошибка импорта:/)).not.toBeInTheDocument() // a new pick clears the old message
    await user.click(screen.getByRole('button', { name: 'Восстановить' }))
    expect(await screen.findByText('Ошибка импорта: Неверный файл: это не экспорт Português PT (v1)')).toBeInTheDocument()
    expect([...store.progressMap().keys()]).toEqual(['a1-ser-estar'])
  })

  test('import cancel closes the confirmation and returns focus', async () => {
    const { user, container } = renderSettings()
    await user.upload(container.querySelector('input[type=file]') as HTMLInputElement, new File(['{}'], 'x.json'))
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Восстановить из файла/ })).toHaveFocus()
  })

  test('reset dialog: counts, the button stays disabled until «СБРОСИТЬ» is typed; progress wiped, settings kept', async () => {
    const yesterday = NOW - DAY
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    try {
      const { user, store } = renderSettings({
        progress: [progress('a1-ser-estar', 9, 10, { at: yesterday }), progress('a1-ter-haver', 3, 10, { at: yesterday, source: 'diagnostic' })],
        cards: [card('c1'), card('c2')],
        errors: [errorEntry('e1')],
        words: [word('casa', 'дом')],
        settings: { voice: 'male', lastDiagnosticAt: yesterday },
      })
      await user.click(screen.getByRole('button', { name: 'Сбросить…' }))
      const dlg = screen.getByRole('alertdialog', { name: 'Сбросить весь прогресс?' })
      const list = within(dlg).getByRole('list', { name: 'Что будет удалено' })
      expect(list).toHaveTextContent('Уроки и тесты2 темы, 1 результат')
      expect(list).toHaveTextContent('Карточки повторения2 карточки')
      expect(list).toHaveTextContent('Словарь1 слово')
      expect(list).toHaveTextContent('Журнал ошибок1 запись')
      expect(list).toHaveTextContent(`Диагностикапоследняя ${new Date(yesterday).toLocaleDateString('ru-RU')}`)
      expect(list).toHaveTextContent('Серия1 день')
      const input = within(dlg).getByRole('textbox', { name: 'Чтобы подтвердить, введите «СБРОСИТЬ»' })
      expect(input).toHaveFocus()
      const go = within(dlg).getByRole('button', { name: 'Сбросить прогресс' })
      expect(go).toBeDisabled()
      await user.type(input, 'СБРОС')
      expect(go).toBeDisabled()
      await user.type(input, 'ить ') // case-insensitive, trimmed
      expect(go).toBeEnabled()
      await user.click(go)
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      expect(await screen.findByText('Прогресс сброшен')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent(/^\/$/))
      expect(store.progressMap().size).toBe(0)
      expect(store.cardList()).toHaveLength(0)
      expect(store.wordList()).toHaveLength(0)
      expect(store.errorList()).toHaveLength(0)
      expect(store.settings().voice).toBe('male')
      expect(store.settings().lastDiagnosticAt).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  test('reset with «Также сбросить настройки», submitted with Enter', async () => {
    const { user, store } = renderSettings({ progress: [progress('a1-ser-estar', 9)], settings: { voice: 'male', rate: 1.25 } })
    await user.click(screen.getByRole('button', { name: 'Сбросить…' }))
    const dlg = screen.getByRole('alertdialog')
    expect(within(dlg).getByRole('list')).toHaveTextContent('Диагностиканет')
    await user.click(within(dlg).getByRole('switch', { name: 'Также сбросить настройки' }))
    await user.type(within(dlg).getByRole('textbox'), 'сбросить{Enter}')
    expect(await screen.findByText('Прогресс и настройки сброшены')).toBeInTheDocument()
    expect(store.settings()).toEqual(DEFAULT_SETTINGS)
    expect(localStorage.getItem('ptpt:v1:settings')).toBeNull()
  })

  test('reset dialog: «Отмена» closes it; a reopened dialog starts blank', async () => {
    const { user } = renderSettings()
    await user.click(screen.getByRole('button', { name: 'Сбросить…' }))
    await user.type(screen.getByRole('textbox', { name: /СБРОСИТЬ/ }), 'СБРОСИТЬ')
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Сбросить…' }))
    expect(screen.getByRole('textbox', { name: /СБРОСИТЬ/ })).toHaveValue('')
  })

  test('reset dialog: «Сначала скачать резервную копию» exports and confirms', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { user } = renderSettings()
    await user.click(screen.getByRole('button', { name: 'Сбросить…' }))
    await user.click(screen.getByRole('button', { name: 'Сначала скачать резервную копию' }))
    expect(await screen.findByText('Копия сохранена')).toBeInTheDocument()
    expect(click).toHaveBeenCalledOnce()
    click.mockRestore()
  })

  test('legacy word cards: hidden without them; counted, deleted after confirmation', async () => {
    const { user, store } = renderSettings({
      cards: [card('w:no-cafe:0', { kind: 'word' }), card('g:a2-um-dia-em-lisboa:1', { kind: 'word' }), card('ph:no-cafe:0', { kind: 'phrase' })],
    })
    expect(await screen.findByText('Удалить старые карточки слов')).toBeInTheDocument()
    expect(screen.getByText(/2 карточки слов из тем/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Удалить…' }))
    const dlg = screen.getByRole('alertdialog', { name: 'Удалить старые карточки слов?' })
    expect(within(dlg).getByRole('button', { name: 'Отмена' })).toHaveFocus()
    await user.click(within(dlg).getByRole('button', { name: 'Удалить 2' }))
    expect(await screen.findByText(/Старые карточки слов удалены: 2\./)).toBeInTheDocument()
    expect(store.cardList().map((c) => c.id)).toEqual(['ph:no-cafe:0'])
    expect(screen.getByText('Удалено старых карточек слов: 2')).toBeInTheDocument() // toast
  })

  test('legacy section is absent when there are no legacy cards', async () => {
    renderSettings({ cards: [card('ph:no-cafe:0', { kind: 'phrase' })] })
    await act(() => Promise.resolve())
    expect(screen.queryByText('Удалить старые карточки слов')).not.toBeInTheDocument()
  })
})
