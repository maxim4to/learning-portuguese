import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Markdown } from '@/components/Markdown'
import { SpeakButton } from '@/components/SpeakButton'
import { renderWithProviders } from '../../helpers/render'

const audio = vi.hoisted(() => {
  let resolve: ((r: { source: 'file' | 'speech' | 'none' }) => void) | null = null
  return {
    speak: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
    finish(source: 'file' | 'speech' | 'none' = 'file') {
      resolve?.({ source })
      resolve = null
    },
    pending() {
      return new Promise<{ source: 'file' | 'speech' | 'none' }>((r) => (resolve = r))
    },
  }
})
vi.mock('@/engine/audio', async (orig) => {
  const real = await orig<typeof import('@/engine/audio')>()
  const { vi: v } = await import('vitest')
  audio.speak = v.fn(() => audio.pending())
  return { ...real, speak: audio.speak, stopSpeaking: v.fn(), getPtPtVoices: v.fn(async () => []), pickPtPtVoice: v.fn(async () => null) }
})

describe('SpeakButton', () => {
  beforeEach(() => {
    audio.speak.mockClear()
  })
  afterEach(() => {
    audio.finish()
  })

  test('icon-only: «Прослушать» → speaks with the settings voice/rate × factor → «Остановить» while playing', async () => {
    const { user } = renderWithProviders(<SpeakButton text="Bom dia" />, { seed: { settings: { voice: 'male', rate: 1.2 } } })
    const btn = screen.getByRole('button', { name: 'Прослушать' })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    await user.click(btn)
    expect(audio.speak).toHaveBeenCalledWith('Bom dia', { voice: 'male', rate: 1.2 })
    const stop = screen.getByRole('button', { name: 'Остановить' })
    expect(stop).toHaveAttribute('aria-pressed', 'true')
    await user.click(stop)
    expect(screen.getByRole('button', { name: 'Прослушать' })).toBeInTheDocument()
  })

  test('slow variant: name «Прослушать медленно», rate × 0.75, voice override', async () => {
    const { user } = renderWithProviders(<SpeakButton text="Obrigado" rateFactor={0.75} voice="female" />)
    await user.click(screen.getByRole('button', { name: 'Прослушать медленно' }))
    expect(audio.speak).toHaveBeenCalledWith('Obrigado', { voice: 'female', rate: 0.75 })
  })

  test('labelled: visible label (no aria-pressed), «Стоп» while playing; no voice → «нет голоса pt-PT»', async () => {
    const { user } = renderWithProviders(<SpeakButton text="Olá" label="Слушать" size="sm" variant="solid" />)
    const btn = screen.getByRole('button', { name: 'Слушать' })
    expect(btn).not.toHaveAttribute('aria-pressed')
    await user.click(btn)
    expect(screen.getByRole('button', { name: 'Остановить' })).toHaveTextContent('Стоп')
    await act(async () => audio.finish('none'))
    const again = screen.getByRole('button', { name: 'Слушать' })
    expect(again).toHaveAttribute('title', 'Нет голоса pt-PT на этом устройстве')
    expect(screen.getByText('нет голоса pt-PT')).toBeInTheDocument()
  })

  test('icon-only buttons do not show the «нет голоса» note unless asked; click does not bubble', async () => {
    const parent = vi.fn()
    const { user } = renderWithProviders(
      <div onClick={parent}>
        <SpeakButton text="Sim" ariaLabel="Прослушать слово" />
      </div>,
    )
    await user.click(screen.getByRole('button', { name: 'Прослушать слово' }))
    expect(parent).not.toHaveBeenCalled()
    await act(async () => audio.finish('none'))
    expect(screen.queryByText('нет голоса pt-PT')).not.toBeInTheDocument()
  })
})

describe('Markdown', () => {
  const md = [
    '# Заголовок',
    '',
    'Текст с **жирным**, *курсивом*, ~~зачёркнутым~~ и `кодом`. [Внешняя](https://example.test) и [внутренняя](/topic/x).',
    '',
    '### Подраздел',
    '',
    '#### Мелкий',
    '',
    '- один',
    '- два',
    '',
    '1. первый',
    '',
    '> цитата',
    '',
    '---',
    '',
    '```js',
    'const a = 1',
    '```',
    '',
    '| Связка | Перевод | Наклонение | Пример |',
    '|---|---|---|---|',
    '| mas | но | ind. | Quero ir, mas não posso. |',
  ].join('\n')

  test('maps markdown to the styled elements (h1→h2, lists, quote, code, links)', () => {
    const { container } = render(<Markdown>{md}</Markdown>)
    expect(screen.getByRole('heading', { level: 2, name: 'Заголовок' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Подраздел' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 4, name: 'Мелкий' })).toBeInTheDocument()
    expect(container.querySelector('strong')).toHaveTextContent('жирным')
    expect(container.querySelector('em')).toHaveTextContent('курсивом')
    expect(container.querySelector('del')).toHaveTextContent('зачёркнутым')
    expect(container.querySelector('blockquote')).toHaveTextContent('цитата')
    expect(container.querySelector('hr')).not.toBeNull()
    expect(container.querySelectorAll('ul > li')).toHaveLength(2)
    expect(container.querySelectorAll('ol > li')).toHaveLength(1)
    const inline = [...container.querySelectorAll('code')].find((c) => c.textContent === 'кодом')!
    expect(inline.className).toContain('font-mono')
    expect(container.querySelector('pre code')!.className).toBe('language-js')
    expect(screen.getByRole('link', { name: 'Внешняя' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'внутренняя' })).not.toHaveAttribute('target')
  })

  test('tables: header cells, and on phones the 3rd+ cells get their column header as a label', () => {
    render(<Markdown>{md}</Markdown>)
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Связка', 'Перевод', 'Наклонение', 'Пример'])
    const cells = screen.getAllByRole('cell')
    expect(cells[0]).toHaveTextContent(/^mas$/)
    expect(cells[1]).toHaveTextContent('— но') // the inline dash before column 2
    expect(cells[2]).toHaveTextContent('Наклонение:ind.')
    expect(cells[3]).toHaveTextContent('Пример:Quero ir')
  })

  test('pt: marks the block for selection lookup and encodes the source', () => {
    const { container, rerender } = render(<Markdown pt={{ kind: 'cheatsheet', id: 'conectores' }}>texto</Markdown>)
    const root = container.firstElementChild!
    expect(root).toHaveAttribute('data-lookup', 'select')
    expect(root.getAttribute('data-pt-src')).toContain('conectores')
    rerender(<Markdown pt>texto</Markdown>)
    expect(container.firstElementChild).not.toHaveAttribute('data-pt-src')
    rerender(<Markdown>texto</Markdown>)
    expect(container.firstElementChild).not.toHaveAttribute('data-lookup')
  })
})
