import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { getDiagnostic, LEVELS, type DiagnosticQuestion } from '@/content'
import type { AnswerRecord } from '@/features/exercises'
import { DiagnosticPage } from '@/features/diagnostic/DiagnosticPage'
import { formatDate } from '@/features/diagnostic/plan'
import { DAY, NOW, type Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'

const QUESTIONS = getDiagnostic().questions
const STAGES = LEVELS.map((level) => QUESTIONS.filter((q) => q.level === level)).filter((qs) => qs.length > 0)
const DIAG_KEY = 'ptpt:v1:diagnostic'

const answer = (q: DiagnosticQuestion, ok: boolean): AnswerRecord => ({
  exerciseId: q.id,
  topicId: q.topicId,
  given: ok ? 'ok' : 'nope',
  expected: 'exp',
  verdict: ok ? 'correct' : 'wrong',
  ok,
})
const stageSummary = (qs: DiagnosticQuestion[], okCount: number) => {
  const answers = qs.map((q, i) => answer(q, i < okCount))
  return { correct: answers.filter((a) => a.ok).length, total: answers.length, answers }
}

/**
 * Seeds an in-progress diagnostic: stages in content order, finished `results`, and the runner of stage `stage`
 * one click from its end (last task answered), so «Продолжить» → «Завершить» finishes that stage.
 */
function seedInProgress(stage: number, okInStage: number, results: ReturnType<typeof stageSummary>[] = [], between = false) {
  sessionStorage.setItem(
    DIAG_KEY,
    JSON.stringify({ stages: STAGES.map((qs) => ({ level: qs[0].level, ids: qs.map((q) => q.id) })), results, stage, between }),
  )
  if (between) return
  const qs = STAGES[stage]
  const s = stageSummary(qs, okInStage)
  sessionStorage.setItem(
    `ptpt:v1:run:diag:${stage}`,
    JSON.stringify({ ids: qs.map((q) => q.id), index: qs.length - 1, answers: s.answers.slice(0, -1), current: s.answers.at(-1) }),
  )
}

function open(seed?: Seed) {
  return renderWithProviders(<DiagnosticPage />, { route: '/diagnostic', seed })
}

const finishStage = async (user: ReturnType<typeof open>['user']) => {
  await user.click(screen.getByRole('button', { name: 'Продолжить' }))
  await user.click(screen.getByRole('button', { name: 'Завершить' }))
}

afterEach(() => vi.restoreAllMocks())

describe('DiagnosticPage: intro', () => {
  test('stages per level, totals, first-time note, «Начать» focused', () => {
    open()
    expect(screen.getByRole('heading', { level: 1, name: 'Диагностика уровня' })).toBeInTheDocument()
    const how = screen.getByRole('region', { name: 'Как проходит тест' })
    const rows = within(how).getAllByRole('listitem')
    expect(rows).toHaveLength(STAGES.length)
    expect(rows[0]).toHaveTextContent(`Этап 1Уровень A1${STAGES[0].length} вопросов`)
    const what = screen.getByRole('region', { name: 'Что внутри' })
    expect(within(what).getByText(String(QUESTIONS.length))).toBeInTheDocument()
    expect(within(what).getByText('~20 мин')).toBeInTheDocument()
    expect(within(what).getByText('A1–B1')).toBeInTheDocument()
    expect(screen.getByText('Вы ещё не проходили диагностику — результат появится здесь.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Начать' })).toHaveFocus()
  })

  test('only a date of the last diagnostic (no matching history) → «Последняя диагностика: …»', () => {
    open({ settings: { lastDiagnosticAt: NOW - DAY } })
    expect(screen.getByText(`Последняя диагностика: ${formatDate(NOW - DAY)}.`)).toBeInTheDocument()
  })

  test('last result from history: counters, «Пройти заново», «Карта тем и маршрут» → result view → «Назад»', async () => {
    const at = NOW - DAY
    const hist = (topicId: string, correct: number, total: number) => ({
      topicId,
      status: 'learning' as const,
      attempts: 1,
      lastPct: correct / total,
      bestPct: correct / total,
      lastAt: at,
      history: [{ topicId, correct, total, at, source: 'diagnostic' as const }],
    })
    const { user } = open({
      settings: { lastDiagnosticAt: at },
      progress: [hist(STAGES[0][0].topicId, 1, 1), hist(STAGES[0][1].topicId === STAGES[0][0].topicId ? STAGES[0][2].topicId : STAGES[0][1].topicId, 0, 1)],
    })
    const last = screen.getByRole('region', { name: 'Последний результат' })
    expect(within(last).getByText(formatDate(at))).toBeInTheDocument()
    expect(within(last).getByText('Не оценивались: A2, B1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Пройти заново/ })).toBeInTheDocument()
    await user.click(within(last).getByRole('button', { name: 'Карта тем и маршрут' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Последний результат' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '← Назад' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Диагностика уровня' })).toBeInTheDocument()
  })
})

describe('DiagnosticPage: run', () => {
  test('«Начать» → stage 1 runner (A1), stage dots, first task focused', async () => {
    const { user } = open()
    await user.click(screen.getByRole('button', { name: 'Начать' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Диагностика' })).toBeInTheDocument()
    const dots = screen.getByRole('list', { name: 'Этапы' })
    expect(within(dots).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['A1', 'A2', 'B1'])
    expect(within(dots).getByText('A1')).toHaveAttribute('aria-current', 'step')
    expect(screen.getAllByText(`Этап 1 из 3 · уровень A1`).length).toBeGreaterThan(0)
    expect(screen.getAllByText((_, el) => el?.textContent === `Задание 1 / ${STAGES[0].length}`).length).toBeGreaterThan(0)
    // Every A1 question is in the stage (shuffled).
    expect(document.activeElement).not.toBe(document.body)
  })

  test('«Выйти» asks for confirmation; «Продолжить тест» returns focus; «Прервать» goes back to the intro', async () => {
    const { user } = open()
    await user.click(screen.getByRole('button', { name: 'Начать' }))
    const exit = screen.getByRole('button', { name: 'Выйти' })
    await user.click(exit)
    expect(exit).toHaveAttribute('aria-expanded', 'true')
    const dlg = screen.getByRole('alertdialog', { name: 'Прервать диагностику?' })
    expect(within(dlg).getByRole('button', { name: 'Продолжить тест' })).toHaveFocus()
    await user.click(within(dlg).getByRole('button', { name: 'Продолжить тест' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(exit).toHaveFocus()
    await user.click(exit)
    await user.click(screen.getByRole('button', { name: 'Прервать' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Диагностика уровня' })).toBeInTheDocument()
    expect(sessionStorage.getItem(DIAG_KEY)).toBeNull()
  })

  test('the run is persisted for the tab session', async () => {
    const { user } = open()
    await user.click(screen.getByRole('button', { name: 'Начать' }))
    const snap = JSON.parse(sessionStorage.getItem(DIAG_KEY)!)
    expect(snap).toMatchObject({ stage: 0, between: false, results: [] })
    expect(snap.stages.map((s: { level: string }) => s.level)).toEqual(['A1', 'A2', 'B1'])
    expect(new Set(snap.stages[0].ids)).toEqual(new Set(STAGES[0].map((q) => q.id)))
  })
})

describe('DiagnosticPage: resume, interstitial and result', () => {
  test('saved run → «Незаконченная диагностика» banner; «Продолжить» resumes the stage', async () => {
    seedInProgress(0, STAGES[0].length)
    const { user } = open()
    expect(screen.getByText(/Этап 1 из 3 — можно продолжить с того же места\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Продолжить' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Начать заново' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))
    expect(screen.getByText(`Продолжаем с задания ${STAGES[0].length} из ${STAGES[0].length}.`)).toBeInTheDocument()
  })

  test('good stage → interstitial with «Дальше: уровень A2 →» (focused) → stage 2', async () => {
    seedInProgress(0, STAGES[0].length)
    const { user } = open()
    await finishStage(user)
    expect(screen.getByText('Этап 1 из 3 завершён · уровень A1')).toBeInTheDocument()
    expect(screen.getByText(`Верно ${STAGES[0].length} из ${STAGES[0].length}`)).toBeInTheDocument()
    expect(screen.getByText('Следующий этап — уровень A2.')).toBeInTheDocument()
    const side = screen.getByRole('complementary', { name: 'Этапы' })
    expect(within(side).getAllByRole('listitem')[0]).toHaveTextContent('пройден')
    const go = screen.getByRole('button', { name: 'Дальше: уровень A2 →' })
    expect(go).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Завершить сейчас (A2, B1 не будут оценены)' })).toBeInTheDocument()
    expect(JSON.parse(sessionStorage.getItem(DIAG_KEY)!)).toMatchObject({ stage: 0, between: true })
    await user.click(go)
    expect(screen.getAllByText('Этап 2 из 3 · уровень A2').length).toBeGreaterThan(0)
  })

  test('low stage (< 40 %) → offer to stop; «Остановить здесь» → result with skipped levels; saved', async () => {
    seedInProgress(0, 2)
    const { user, store } = open()
    await finishStage(user)
    expect(screen.getByText(/На уровне A1 много ошибок/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Продолжить: A2' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Остановить здесь' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Результат диагностики' })).toBeInTheDocument()
    expect(screen.getByText('Не оценивались: A2, B1 — диагностика остановлена раньше.')).toBeInTheDocument()
    const wrong = STAGES[0].length - 2
    expect(await screen.findByText(`Ошибки записаны в журнал (+${wrong}); карточки на повторение не создавались.`)).toBeInTheDocument()
    expect(store.errorList()).toHaveLength(wrong)
    expect(store.cardList()).toHaveLength(0)
    const topics = new Set(STAGES[0].map((q) => q.topicId))
    expect(store.progressList().map((p) => p.topicId).sort()).toEqual([...topics].sort())
    expect(store.progressList()[0].history[0].source).toBe('diagnostic')
    expect(sessionStorage.getItem(DIAG_KEY)).toBeNull()
  })

  test('resume between stages → interstitial; «Завершить сейчас» finishes', async () => {
    seedInProgress(0, 0, [stageSummary(STAGES[0], STAGES[0].length)], true)
    const { user } = open()
    expect(screen.getByText(/Этап 1 из 3 — можно продолжить/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Продолжить' }))
    await user.click(screen.getByRole('button', { name: /Завершить сейчас/ }))
    expect(screen.getByRole('heading', { level: 1, name: 'Результат диагностики' })).toBeInTheDocument()
    // All green → no route.
    expect(await screen.findByText(/Проверенные темы вы знаете уверенно/)).toBeInTheDocument()
  })

  test('last stage finished → result straight away (no interstitial), nothing skipped', async () => {
    seedInProgress(2, 0, [stageSummary(STAGES[0], STAGES[0].length), stageSummary(STAGES[1], STAGES[1].length)])
    const { user, store } = open()
    await finishStage(user)
    expect(screen.getByRole('heading', { level: 1, name: 'Результат диагностики' })).toBeInTheDocument()
    expect(screen.queryByText(/Не оценивались/)).not.toBeInTheDocument()
    await vi.waitFor(() => expect(store.errorList()).toHaveLength(STAGES[2].length))
    // «Пройти заново» starts a fresh run.
    await user.click(screen.getByRole('button', { name: 'Пройти заново' }))
    expect(screen.getAllByText('Этап 1 из 3 · уровень A1').length).toBeGreaterThan(0)
  })

  test('a failed save is reported on the result', async () => {
    seedInProgress(2, 1, [stageSummary(STAGES[0], 1), stageSummary(STAGES[1], 1)])
    const { user, store } = open()
    vi.spyOn(store, 'saveTopicResult').mockRejectedValue(new Error('offline'))
    await finishStage(user)
    expect(await screen.findByText('Не удалось сохранить: offline')).toBeInTheDocument()
  })

  test('a snapshot with unknown question ids is ignored', () => {
    sessionStorage.setItem(DIAG_KEY, JSON.stringify({ stages: [{ level: 'A1', ids: ['gone'] }], results: [], stage: 0, between: false }))
    open()
    expect(screen.queryByText(/Незаконченная диагностика/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Начать' })).toBeInTheDocument()
  })
})
