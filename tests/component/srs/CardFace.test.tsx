/**
 * CardFace (classic flip cards: legacy word / phrase / grammar, orphaned error cards) and WordCardFace in all
 * WordCardMode values (recognize, produce, cloze, listen): front, back after reveal, typed answers, lookup lock.
 */
import { act, screen, within } from '@testing-library/react'
import { useEffect, useState } from 'react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { getTopic } from '@/content'
import { DEFAULT_SETTINGS, type Settings, type SrsCard } from '@/data/types.ts'
import { speak } from '@/engine/audio'
import { CardFace, CardHeader, TopicRepeatLink } from '@/features/srs/CardFace'
import { LISTEN_MARK } from '@/features/srs/kinds'
import type { AnswerRecord } from '@/features/exercises/types'
import { NOW, card, wordCard } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { casa, comer, freezeDate, saude } from '../../helpers/B-srs-fixtures'

const listen = vi.hoisted(() => ({ text: null as string | null | undefined }))

vi.mock('@/engine/audio', async (orig) => ({
  ...(await orig<typeof import('@/engine/audio')>()),
  speak: vi.fn(async () => ({ source: 'none' })),
  stopSpeaking: vi.fn(),
  hasAudioFile: vi.fn(async () => false),
  pickPtPtVoice: vi.fn(async () => null),
}))
vi.mock('@/features/words/audio.ts', async (orig) => ({
  ...(await orig<typeof import('@/features/words/audio.ts')>()),
  useListenText: () => listen.text,
}))

const S = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch })

interface FaceOpts {
  revealed?: boolean
  typed?: boolean
  settings?: Settings
  answer?: AnswerRecord | null
  onAnswered?: (r: AnswerRecord) => void
  words?: (typeof casa)[]
}
function face(c: SrsCard, o: FaceOpts = {}) {
  let set: (v: { revealed: boolean; answer?: AnswerRecord | null }) => void = () => {}
  function Harness() {
    const [st, setSt] = useState<{ revealed: boolean; answer?: AnswerRecord | null }>({ revealed: o.revealed ?? false, answer: o.answer })
    useEffect(() => {
      set = setSt
    }, [])
    return <CardFace card={c} revealed={st.revealed} settings={o.settings ?? S()} typed={o.typed} answer={st.answer} onAnswered={o.onAnswered} />
  }
  const r = renderWithProviders(<Harness />, { seed: { cards: [c], words: o.words } })
  return { ...r, rerenderWith: (revealed: boolean, answer?: AnswerRecord | null) => act(() => set({ revealed, answer })) }
}
const lookupBox = (el: HTMLElement) => el.closest('[data-lookup]')

beforeEach(() => {
  freezeDate(NOW)
  listen.text = null
  vi.mocked(speak).mockClear()
})
afterEach(() => vi.useRealTimers())

describe('CardFace · classic cards', () => {
  test('phrase card: header chip + topic title, ru front, pt back with audio after reveal; lookup locked until reveal', () => {
    const c = card('ph:x', { kind: 'phrase', topicId: 'a1-ser-estar', front: 'Я из России', back: 'Sou da Rússia' })
    const { rerenderWith } = face(c)
    expect(screen.getByText('Фраза')).toBeInTheDocument()
    expect(screen.getByText(getTopic('a1-ser-estar')!.title)).toBeInTheDocument()
    expect(screen.getByText('Переведите на португальский:')).toBeInTheDocument()
    expect(lookupBox(screen.getByText('Я из России'))).toHaveAttribute('data-lookup', 'off')
    expect(screen.queryByText('Sou da Rússia')).not.toBeInTheDocument()
    rerenderWith(true)
    expect(screen.getByText('Sou da Rússia')).toHaveAttribute('lang', 'pt-PT')
    expect(screen.getByRole('button', { name: 'Прослушать' })).toBeInTheDocument()
    expect(lookupBox(screen.getByText('Sou da Rússia'))).toHaveAttribute('data-lookup', 'on')
  })

  test('legacy word card (no mode): «Как это по-португальски?»', () => {
    face(card('w:legacy', { kind: 'word', front: 'вода', back: 'a água' }))
    expect(screen.getByText('Как это по-португальски?')).toBeInTheDocument()
    expect(screen.getByText('Слово')).toBeInTheDocument()
  })

  test('grammar card: shows another topic example (never the card’s own sentence)', () => {
    const t = getTopic('a1-ser-estar')!
    const own = t.examples[0]
    const c = card('ex:a1-ser-estar:0', { kind: 'grammar', topicId: t.id, front: own.ru, back: own.pt })
    face(c, { revealed: true })
    expect(screen.getByText('Пример')).toBeInTheDocument()
    const box = screen.getByText('Пример').parentElement!
    const shown = within(box).getByText((_, el) => el?.getAttribute('lang') === 'pt-PT')
    expect(shown.textContent).not.toBe(own.pt)
    expect(t.examples.map((e) => e.pt)).toContain(shown.textContent)
  })

  test('orphaned error card shows its stored task; dictation cards (🎧) hide the answer on the front', () => {
    const plain = card('error:x', { kind: 'error', front: 'Eu ___ cansado.', back: 'estou' })
    const first = face(plain)
    expect(screen.getByText('Исходное задание недоступно')).toBeInTheDocument()
    expect(screen.getByText('Eu ___ cansado.')).toBeInTheDocument()
    first.unmount()

    face(card('error:y', { kind: 'error', front: `${LISTEN_MARK} Bom dia`, back: 'Bom dia' }))
    expect(screen.getByText('Исходное задание недоступно')).toBeInTheDocument()
    expect(screen.queryByText(/Bom dia/)).not.toBeInTheDocument()
  })

  test('CardHeader / TopicRepeatLink: situation topics link to the situation, unknown ids render nothing', () => {
    renderWithProviders(
      <>
        <CardHeader card={card('e', { kind: 'error', topicId: 'nope' })} />
        <TopicRepeatLink topicId="aima-documentos" />
        <TopicRepeatLink topicId="nope" />
        <TopicRepeatLink topicId={undefined} />
      </>,
    )
    expect(screen.getByText('Работа над ошибкой')).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link', { name: /Повторить тему «AIMA/ })).toHaveAttribute('href', expect.stringContaining('aima-documentos'))
  })
})

describe('WordCardFace · recognize (PT → RU)', () => {
  test('front: pt with article, audio, gender; back: meanings, example, «Открыть слово»', () => {
    const c = wordCard(casa, 'recognize', { front: 'a casa', back: casa.ru })
    const { rerenderWith } = face(c, { words: [casa] })
    expect(screen.getByText('Слово · PT → RU')).toBeInTheDocument()
    expect(screen.getByText(/Мой словарь/)).toBeInTheDocument()
    expect(screen.getByText('Что это значит?')).toBeInTheDocument()
    expect(screen.getByText('a casa')).toHaveAttribute('lang', 'pt-PT')
    expect(screen.getByRole('button', { name: 'Прослушать' })).toBeInTheDocument()
    expect(screen.queryByText('дом; жилище')).not.toBeInTheDocument()
    expect(lookupBox(screen.getByText('a casa'))).toHaveAttribute('data-lookup', 'off')

    rerenderWith(true)
    expect(screen.getByText('дом; жилище')).toBeInTheDocument()
    expect(screen.getByText('Пример')).toBeInTheDocument()
    expect(screen.getByText('A minha casa fica perto do rio.')).toBeInTheDocument()
    expect(screen.getByText('Мой дом рядом с рекой.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Открыть слово/ })).toHaveAttribute('href', `/words/${encodeURIComponent(casa.id)}`)
    expect(lookupBox(screen.getByText('a casa'))).toHaveAttribute('data-lookup', 'on')
  })

  test('word missing from the dictionary: falls back to the card’s own front/back, no «Открыть слово»', () => {
    const c = wordCard(casa, 'recognize', { front: 'a casa', back: 'дом' })
    face(c, { revealed: true }) // no words seeded
    expect(screen.getByText('a casa')).toBeInTheDocument()
    expect(screen.getByText('дом')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Открыть слово/ })).not.toBeInTheDocument()
  })
})

describe('WordCardFace · produce (RU → PT)', () => {
  const c = wordCard(casa, 'produce', { front: casa.ru, back: 'a casa' })

  test('flip: ru + grammar hint on the front; pt with audio on the back', () => {
    const { rerenderWith } = face(c, { words: [casa] })
    expect(screen.getByText('Слово · RU → PT')).toBeInTheDocument()
    expect(screen.getByText('Как это по-португальски?')).toBeInTheDocument()
    expect(screen.getByText('дом; жилище')).toBeInTheDocument()
    expect(screen.getByText('сущ., ж. р.')).toBeInTheDocument()
    expect(screen.queryByText('a casa')).not.toBeInTheDocument()
    rerenderWith(true)
    expect(screen.getByText('a casa')).toHaveAttribute('lang', 'pt-PT')
  })

  test('typed: field + accent keys; the article is optional; Enter with an empty field does nothing', async () => {
    const onAnswered = vi.fn()
    face(c, { words: [casa], typed: true, onAnswered })
    const user = userEvent.setup()
    expect(screen.getByText('Напишите по-португальски')).toBeInTheDocument()
    const field = screen.getByRole('textbox', { name: 'Слово по-португальски' })
    expect(field).toHaveAttribute('aria-describedby', `${c.id}-task`)
    expect(screen.getByRole('group', { name: 'Буквы с диакритикой' })).toBeInTheDocument()
    await user.type(field, '{Enter}')
    expect(onAnswered).not.toHaveBeenCalled()
    await user.type(field, 'a casa{Enter}')
    expect(onAnswered).toHaveBeenCalledWith(expect.objectContaining({ given: 'a casa', expected: 'a casa', verdict: 'correct', ok: true }))
  })

  test('typed: an accent key inserts at the caret', async () => {
    const onAnswered = vi.fn()
    face(wordCard(saude, 'produce', { front: 'здоровье', back: 'a saúde' }), { words: [saude], typed: true, onAnswered })
    const user = userEvent.setup()
    const field = screen.getByRole('textbox', { name: 'Слово по-португальски' })
    await user.type(field, 'sa')
    await user.click(screen.getByRole('button', { name: 'Вставить ú' }))
    // The caret is restored in a requestAnimationFrame: let it run before typing on.
    await act(() => new Promise<void>((r) => requestAnimationFrame(() => r())))
    await user.type(field, 'de', { skipClick: true })
    expect(field).toHaveValue('saúde')
    await user.click(screen.getByRole('button', { name: 'Проверить' }))
    expect(onAnswered).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'correct' }))
  })

  test('typed, answered: the field is locked and shows the verdict; a second submit is ignored', () => {
    const onAnswered = vi.fn()
    const rec: AnswerRecord = { exerciseId: c.id, topicId: '', given: 'caso', expected: 'a casa', verdict: 'wrong', ok: false }
    face(c, { words: [casa], typed: true, onAnswered, answer: rec, revealed: true })
    expect(screen.getByRole('textbox', { name: 'Слово по-португальски' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Слово по-португальски' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('button', { name: 'Проверить' })).not.toBeInTheDocument()
    expect(screen.getByText('Неверно')).toBeInTheDocument()
    expect(screen.getByText('caso')).toBeInTheDocument()
  })
})

describe('WordCardFace · cloze (sentence with a gap)', () => {
  const c = wordCard(comer, 'cloze', { front: 'Ele ___ pão todos os dias.', back: 'Ele come pão todos os dias.' })

  test('front: the sentence with a blank + hint; back: the sentence with the form marked, lemma — meaning', () => {
    const { rerenderWith } = face(c, { words: [comer] })
    expect(screen.getByText('Слово · Пропуск в предложении')).toBeInTheDocument()
    expect(screen.getByText('Какое слово пропущено?')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'пропуск' })).toBeInTheDocument()
    expect(screen.queryByText(/come/)).not.toBeInTheDocument()
    expect(screen.getByText('Подсказка: есть, кушать')).toBeInTheDocument()
    rerenderWith(true)
    expect(screen.getByText('come', { selector: 'b' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Прослушать предложение' })).toBeInTheDocument()
    expect(screen.getByText('comer')).toBeInTheDocument()
    expect(screen.getByText('Он ест хлеб каждый день.')).toBeInTheDocument()
    expect(screen.queryByText('Пример')).not.toBeInTheDocument()
  })

  test('typed: «Впишите пропущенное слово»; the seen form is the answer, «Не знаю» skips', async () => {
    const onAnswered = vi.fn()
    face(c, { words: [comer], typed: true, onAnswered })
    const user = userEvent.setup()
    expect(screen.getByText('Впишите пропущенное слово')).toBeInTheDocument()
    const field = screen.getByRole('textbox', { name: 'Пропущенное слово' })
    expect(field).toHaveAttribute('placeholder', 'форма из предложения')
    await user.type(field, 'come{Enter}')
    expect(onAnswered).toHaveBeenLastCalledWith(expect.objectContaining({ verdict: 'correct', expected: 'come' }))
  })

  test('typed: «Не знаю» reports a skipped wrong answer with the expected form', async () => {
    const onAnswered = vi.fn()
    face(c, { words: [comer], typed: true, onAnswered })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Не знаю' }))
    expect(onAnswered).toHaveBeenCalledWith(expect.objectContaining({ skipped: true, verdict: 'wrong', ok: false, expected: 'come', given: '' }))
  })

  test('word missing from the dictionary: the stored gap / full sentence are used', () => {
    face(c, { revealed: true })
    expect(screen.getByRole('img', { name: 'пропуск' })).toBeInTheDocument()
    expect(screen.getByText('come', { selector: 'b' })).toBeInTheDocument()
  })
})

describe('WordCardFace · listen (audio → PT)', () => {
  const c = wordCard(casa, 'listen', { front: 'a casa', back: casa.ru })

  test('with audio: play + slow buttons, plays once on mount; back shows pt and ru', () => {
    listen.text = 'a casa'
    const { rerenderWith } = face(c, { words: [casa] })
    expect(screen.getByText('Слово · На слух')).toBeInTheDocument()
    expect(screen.getByText('Прослушайте: что это за слово?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Прослушать слово' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Прослушать медленно' })).toBeInTheDocument()
    expect(screen.queryByText('a casa')).not.toBeInTheDocument()
    expect(speak).toHaveBeenCalledWith('a casa', expect.objectContaining({ voice: 'female' }))
    rerenderWith(true)
    expect(screen.getByText('a casa')).toBeInTheDocument()
    expect(screen.getByText('дом; жилище')).toBeInTheDocument()
  })

  test('while the audio check runs: a loading placeholder', () => {
    listen.text = undefined
    face(c, { words: [casa] })
    expect(screen.getByRole('status', { name: 'Загрузка звука' })).toBeInTheDocument()
    expect(speak).not.toHaveBeenCalled()
  })

  test('no audio on the device: recall by the translation instead', () => {
    listen.text = null
    face(c, { words: [casa] })
    expect(screen.getByText('Звук недоступен на этом устройстве. Вспомните слово по переводу:')).toBeInTheDocument()
    expect(screen.getByText('дом; жилище')).toBeInTheDocument()
    expect(speak).not.toHaveBeenCalled()
  })

  test('typed: «Прослушайте и напишите слово»; the bare lemma is accepted', async () => {
    listen.text = 'a casa'
    const onAnswered = vi.fn()
    face(c, { words: [casa], typed: true, onAnswered })
    expect(screen.getByText('Прослушайте и напишите слово')).toBeInTheDocument()
    await userEvent.setup().type(screen.getByRole('textbox', { name: 'Слово по-португальски' }), 'casa{Enter}')
    expect(onAnswered).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'correct', ok: true }))
  })
})
