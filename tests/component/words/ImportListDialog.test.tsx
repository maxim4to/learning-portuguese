import { screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { loadLexicon } from '@/engine/lexicon/lookup'
import { ImportListDialog } from '@/features/words/ImportListDialog'
import { NOW, word, wordCard, type Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { stubAudioFetch } from '../../helpers/B-words-dom'

beforeAll(async () => {
  await loadLexicon()
})
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  stubAudioFetch()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const LIST = [
  'СЛОВА:',
  '1. o pequeno-almoço — завтрак',
  'levantar-se - вставать',
  'a chávena; чашка',
  'xyzzq\tштука',
  'pão — хлеб',
  'pães — хлебы',
  'saúde — здоровье',
  'levantar-se — подниматься',
  'просто текст без разделителя',
  'como = как',
].join('\n')

function setup(seed?: Seed) {
  const onClose = vi.fn()
  const onAdded = vi.fn()
  const r = renderWithProviders(<ImportListDialog onClose={onClose} onAdded={onAdded} />, { seed })
  return { ...r, onClose, onAdded, dialog: screen.getByRole('dialog', { name: 'Импорт списка' }) }
}

async function paste(user: ReturnType<typeof setup>['user'], text: string) {
  await user.click(screen.getByLabelText('Список слов'))
  await user.paste(text)
}

const existingSaude = () => {
  const w = word('saúde', 'здоровье (моё)', { lexId: 'saúde#noun', pos: 'noun', gender: 'f' })
  return { words: [w], cards: [wordCard(w)] }
}

describe('ImportListDialog · paste step', () => {
  test('starts focused on the textarea (lookup off inside), «Разобрать» disabled until there are words', async () => {
    const { user } = setup()
    const ta = screen.getByLabelText('Список слов')
    expect(ta).toHaveFocus()
    expect(ta).toHaveAttribute('data-lookup', 'off')
    expect(screen.getByText(/Пустые строки, нумерация и заголовок «СЛОВА:» пропускаются/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Разобрать' })).toBeDisabled()
    await paste(user, 'nada')
    expect(screen.getByText('Строк со словами: 0 · без разделителя или перевода: 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Разобрать' })).toBeDisabled()
  })

  test('counts lines, merged repeats and skipped lines', async () => {
    const { user } = setup()
    await paste(user, LIST)
    expect(screen.getByText('Строк со словами: 8 · повторы склеены · без разделителя или перевода: 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Разобрать (8)' })).toBeEnabled()
  })

  test('«Отмена» and «Закрыть» call onClose', async () => {
    const { user, onClose, dialog } = setup()
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('ImportListDialog · preview', () => {
  test('rows: found in the lexicon, own word, already saved, repeat; skipped lines listed', async () => {
    const { user } = setup(existingSaude())
    await paste(user, LIST)
    await user.click(screen.getByRole('button', { name: 'Разобрать (8)' }))

    expect(screen.getByText(/Найдено в словаре приложения:/)).toHaveTextContent(
      'Найдено в словаре приложения: 5 · своих слов: 1 · уже в моём словаре: 1',
    )
    const list = screen.getByRole('list', { name: 'Разбор списка' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(8)

    const row = (pt: string) => rows.find((r) => within(r).queryByText(pt, { selector: 'span[lang="pt-PT"]' }))!
    // lexicon lemma, article from the gender, merged translations
    expect(within(row('o pequeno-almoço')).getByText('найдено')).toBeInTheDocument()
    expect(within(row('o pequeno-almoço')).getByText(/сущ\. · мужской род · A2 —/)).toBeInTheDocument()
    expect(within(row('levantar-se')).getByText('вставать; подниматься')).toBeInTheDocument()
    expect(within(row('xyzzq')).getByText('своё слово')).toBeInTheDocument()
    // «pães» resolves to the same word as «pão»
    const paes = rows.find((r) => r.textContent?.includes('из «pães»'))!
    expect(within(paes).getByText('повтор')).toBeInTheDocument()
    expect(within(paes).getByText('То же слово, что в строке 6.')).toBeInTheDocument()
    expect(within(paes).getByRole('checkbox')).not.toBeChecked()
    // already in my dictionary: unchecked, link to it
    const saude = row('a saúde')
    expect(within(saude).getByText('Уже в словаре: «здоровье (моё)». Добавление сохранит перевод и добавит источник.')).toBeInTheDocument()
    expect(within(saude).getByRole('link', { name: 'В словаре' })).toHaveAttribute('href', '/words/sa%C3%BAde%23noun')
    expect(within(saude).getByRole('checkbox')).not.toBeChecked()
    // ambiguous form shows the other readings
    expect(within(row('como')).getByText(/Другие разборы:/)).toHaveTextContent(/comer \(глаг\.\)/)

    expect(screen.getByText('Пропущено строк: 1')).toBeInTheDocument()
    expect(screen.getByText(/Строка 10:/)).toHaveTextContent('Строка 10: просто текст без разделителя — нет разделителя')
    expect(screen.getByRole('button', { name: 'Добавить 6 слов' })).toBeEnabled()
  })

  test('toggling rows changes the count; none picked disables saving; «Назад» keeps the text', async () => {
    const { user } = setup()
    await paste(user, 'pão — хлеб\nxyzzq — штука')
    await user.click(screen.getByRole('button', { name: 'Разобрать (2)' }))
    const boxes = screen.getAllByRole('checkbox')
    await user.click(boxes[0])
    expect(screen.getByRole('button', { name: 'Добавить 1 слово' })).toBeEnabled()
    await user.click(boxes[1])
    expect(screen.getByRole('button', { name: 'Ничего не выбрано' })).toBeDisabled()
    // the label toggles too
    await user.click(screen.getByText('xyzzq'))
    expect(boxes[1]).toBeChecked()
    await user.click(screen.getByRole('button', { name: /Назад/ }))
    expect(screen.getByLabelText('Список слов')).toHaveValue('pão — хлеб\nxyzzq — штука')
  })

  test('«Добавить N слов» saves the picked rows in one batch (source «из беседы с агентом» for a СЛОВА: block)', async () => {
    const { user, store, onAdded } = setup(existingSaude())
    await paste(user, LIST)
    await user.click(screen.getByRole('button', { name: 'Разобрать (8)' }))
    // also pick the existing word: keeps its translation, adds a source
    const saude = screen.getAllByRole('listitem').find((r) => r.textContent?.includes('Уже в словаре'))!
    await user.click(within(saude).getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Добавить 7 слов' }))
    expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ undo: expect.any(Function) }), 7)

    const byId = new Map(store.wordList().map((w) => [w.id, w]))
    expect([...byId.keys()].sort()).toEqual(
      ['chávena#noun', 'como#adv', 'levantar-se#verb', 'pequeno-almoço#noun', 'pão#noun', 'saúde#noun', 'u:xyzzq'].sort(),
    )
    expect(byId.get('levantar-se#verb')).toMatchObject({ ru: 'вставать; подниматься', lexId: 'levantar-se#verb' })
    expect(byId.get('pequeno-almoço#noun')).toMatchObject({ gender: 'm', pos: 'noun' })
    expect(byId.get('pequeno-almoço#noun')!.sources[0]).toMatchObject({ src: 'manual:tutor', form: 'o pequeno-almoço' })
    expect(byId.get('u:xyzzq')).toMatchObject({ ru: 'штука' })
    expect(byId.get('u:xyzzq')!.lexId).toBeUndefined()
    expect(byId.get('saúde#noun')!.ru).toBe('здоровье (моё)')
    expect(byId.get('saúde#noun')!.sources).toHaveLength(2)

    // undo removes the batch and restores the existing word
    await onAdded.mock.calls[0][0].undo()
    expect(store.wordList().map((w) => w.id)).toEqual(['saúde#noun'])
    expect(store.wordList()[0].sources).toHaveLength(1)
  })

  test('a plain list is saved with the «import» source', async () => {
    const { user, store } = setup()
    await paste(user, 'fixe — классный')
    await user.click(screen.getByRole('button', { name: 'Разобрать (1)' }))
    await user.click(screen.getByRole('button', { name: 'Добавить 1 слово' }))
    expect(store.wordList()[0].sources[0].src).toBe('manual:import')
  })

  test('a failed save is reported and the dialog stays', async () => {
    const { user, store, onAdded } = setup()
    vi.spyOn(store, 'saveWordBundle').mockRejectedValue(new Error('quota'))
    await paste(user, 'fixe — классный')
    await user.click(screen.getByRole('button', { name: 'Разобрать (1)' }))
    await user.click(screen.getByRole('button', { name: 'Добавить 1 слово' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить: quota')
    expect(onAdded).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Добавить 1 слово' })).toBeEnabled()
  })
})
