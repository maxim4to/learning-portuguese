/**
 * Workstream C: drives the exercise runner through ANY exercise kind, by mouse/touch or by keyboard only.
 * The current exercise is identified by its task region (`aria-labelledby="<exercise id>-h"`) and answered from
 * content/ (C-content.ts). Extends the shared ExerciseRunner page object (tests/helpers/pages.ts, frozen).
 */
import { expect, type Locator, type Page } from '@playwright/test'
import type { Exercise } from '../../src/content/schema.ts'
import { ExerciseRunner } from './pages'
import { exerciseById } from './C-content'

export type InputMode = 'mouse' | 'keyboard'
export type Outcome = 'correct' | 'wrong' | 'skip'

/** Verdict heading in the feedback block per outcome (ExerciseFeedback). */
export const VERDICT: Record<Outcome, RegExp> = {
  correct: /^Верно!$/,
  wrong: /^Неверно$/,
  skip: /^Ничего страшного — вот ответ$/,
}

const TEXT_KINDS = new Set<Exercise['type']>(['fill-gap', 'transform', 'translate-ru-pt', 'listen-type'])

export interface RunPlan {
  mode: InputMode
  /** Exercise ids to answer wrongly / with «Не знаю». Everything else is answered correctly. */
  wrong?: readonly string[]
  skip?: readonly string[]
  /** Called after each answer (before «Дальше»), e.g. to probe the lookup lock. */
  afterAnswer?(ex: Exercise, index: number): Promise<void>
  /** Called before each answer. */
  beforeAnswer?(ex: Exercise, index: number): Promise<void>
}

export class CRunner extends ExerciseRunner {
  constructor(page: Page) {
    super(page)
  }

  /**
   * The current task card: the region labelled by the task heading (`<exercise id>-h`). Narrower than the shared
   * page object's «first region», which on reading pages is the glossary.
   */
  override get task(): Locator {
    // Hidden tab panels keep their runners mounted: only the visible one counts.
    return this.page.locator('section[aria-labelledby$="-h"]').filter({ visible: true }).first()
  }

  /** Id of the exercise currently shown. */
  async currentId(): Promise<string> {
    const by = await this.task.getAttribute('aria-labelledby')
    if (!by) throw new Error('no task region on the page')
    return by.replace(/-h$/, '')
  }

  async current(): Promise<Exercise> {
    return exerciseById(await this.currentId())
  }

  /** Any text field of the task (single field kinds: «Ваш ответ», «Новое предложение», «Перевод…», «Что вы услышали»). */
  textFields(): Locator {
    return this.task.getByRole('textbox')
  }
  options(): Locator {
    return this.task.getByRole('radiogroup', { name: 'Варианты ответа' }).getByRole('radio')
  }
  bank(): Locator {
    return this.task.getByRole('group', { name: 'Слова' })
  }
  built(): Locator {
    return this.task.getByRole('group', { name: 'Ваше предложение' })
  }
  column(side: 'L' | 'R'): Locator {
    return this.task.getByRole('list', { name: side === 'L' ? 'Левый столбец' : 'Правый столбец' })
  }
  verdict(): Locator {
    return this.task.getByText(/^(Верно!|Неверно|Почти: ошибка только в акцентах|Верно, но проверьте акценты|Ничего страшного — вот ответ|Отлично!|Потренируйтесь ещё)$/)
  }

  /** The control that must own focus when a task of this kind appears (keyboard flow). */
  primaryControl(ex: Exercise): Locator {
    switch (ex.type) {
      case 'fill-gap':
      case 'transform':
      case 'translate-ru-pt':
      case 'listen-type':
        return this.textFields().first()
      case 'choice':
        return this.options().first()
      case 'listen-choice':
      case 'speak-shadow':
        return this.task.getByRole('button', { name: 'Слушать', exact: true })
      case 'order-words':
        return this.bank().getByRole('button').first()
      case 'match':
        return this.column('L').getByRole('button').first()
    }
  }

  private async focusedText(): Promise<string> {
    return this.page.evaluate(() => (document.activeElement?.textContent ?? '').replace(/— сопоставлено$/, '').trim())
  }

  /** Presses `key` until the focused element's text is `text` (roving focus groups). */
  private async roveTo(text: string, key = 'ArrowRight', max = 20) {
    for (let i = 0; i < max; i++) {
      if ((await this.focusedText()) === text) return
      await this.page.keyboard.press(key)
    }
    throw new Error(`could not rove to «${text}» with ${key}; focused: «${await this.focusedText()}»`)
  }

  /** Answers the current exercise. Returns it. */
  async answer(ex: Exercise, mode: InputMode, outcome: Outcome = 'correct'): Promise<Exercise> {
    const kb = mode === 'keyboard'
    if (outcome === 'skip') {
      if (ex.type === 'choice' || ex.type === 'listen-choice' || ex.type === 'match' || ex.type === 'speak-shadow')
        throw new Error(`${ex.type} has no «Не знаю»`)
      if (kb) await this.page.keyboard.press('Shift+Enter')
      else await this.task.getByRole('button', { name: 'Не знаю' }).click()
      return ex
    }
    const ok = outcome === 'correct'

    if (TEXT_KINDS.has(ex.type)) {
      const answer = ok ? (ex as { answer: string[] }).answer[0] : 'xyzzy'
      const fields = this.textFields()
      const n = await fields.count()
      const parts = n > 1 ? answer.split(/\s*\/\s*/) : [answer]
      if (kb) {
        await expect(fields.first()).toBeFocused()
        for (let i = 0; i < n; i++) {
          await this.page.keyboard.type(parts[i] ?? parts[parts.length - 1])
          await this.page.keyboard.press('Enter') // several gaps: Enter moves to the next empty one, then checks
        }
      } else {
        for (let i = 0; i < n; i++) await fields.nth(i).fill(parts[i] ?? parts[parts.length - 1])
        await this.task.getByRole('button', { name: 'Проверить' }).click()
      }
      return ex
    }

    switch (ex.type) {
      case 'choice':
      case 'listen-choice': {
        const i = ok ? ex.correct : (ex.correct + 1) % ex.options.length
        if (kb) await this.page.keyboard.press(String(i + 1))
        else await this.options().nth(i).click()
        return ex
      }
      case 'order-words': {
        const tokens = ok ? ex.answer.split(' ') : [...ex.answer.split(' ')].reverse()
        for (const t of tokens) {
          if (kb) {
            await this.roveTo(t, 'ArrowRight', ex.words.length + 1)
            await this.page.keyboard.press('Enter')
          } else {
            await this.bank().getByRole('button', { name: t, exact: true }).first().click()
          }
        }
        await expect(this.built()).toContainText(tokens.join(' ').split(' ')[0])
        if (kb) await this.page.keyboard.press('Control+Enter')
        else await this.task.getByRole('button', { name: 'Проверить' }).click()
        return ex
      }
      case 'match': {
        const pairs = ex.pairs
        if (!ok) {
          // One wrong pair first (counted as a mistake), then everything right.
          await this.pair(pairs[0].left, pairs[1].right, kb)
          await expect(this.task.getByText(/^Ошибок: 1/)).toBeVisible()
        }
        for (const p of pairs) await this.pair(p.left, p.right, kb)
        return ex
      }
      case 'speak-shadow': {
        await this.task.getByRole('button', { name: ok ? 'Получилось' : 'Ещё потренироваться' }).click()
        return ex
      }
      default:
        throw new Error(`unhandled kind ${ex.type}`)
    }
  }

  private async pair(left: string, right: string, kb: boolean) {
    if (!kb) {
      await this.column('L').getByRole('button', { name: left, exact: true }).click()
      await this.column('R').getByRole('button', { name: right, exact: true }).click()
      return
    }
    await this.page.keyboard.press('ArrowLeft') // back to the left column (no-op when already there)
    await this.roveTo(left, 'ArrowDown')
    await this.page.keyboard.press('Enter')
    await expect(this.column('L').getByRole('button', { name: left, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await this.page.keyboard.press('ArrowRight')
    await this.roveTo(right, 'ArrowDown')
    await this.page.keyboard.press('Enter')
  }

  /**
   * Runs the remaining tasks of the run on screen until the last «Завершить». Keyboard mode asserts the focus
   * contract: the new task's primary control is focused, the verdict appears, «Дальше» gets focus, Enter advances.
   * Returns the exercises answered (in order).
   */
  async runAll(plan: RunPlan): Promise<Exercise[]> {
    const kb = plan.mode === 'keyboard'
    const done: Exercise[] = []
    for (let i = 0; i < 100; i++) {
      const ex = await this.current()
      if (kb) await expect(this.primaryControl(ex), `focus on the primary control of ${ex.id} (${ex.type})`).toBeFocused()
      await plan.beforeAnswer?.(ex, i)
      const outcome: Outcome = plan.skip?.includes(ex.id) ? 'skip' : plan.wrong?.includes(ex.id) ? 'wrong' : 'correct'
      await this.answer(ex, plan.mode, outcome)
      await expect(this.verdict(), `verdict of ${ex.id} (${ex.type})`).toHaveText(VERDICT[outcome])
      await plan.afterAnswer?.(ex, i)
      done.push(ex)
      const last = (await this.nextButton.textContent())?.includes('Завершить')
      await this.next({ keyboardOnly: kb })
      if (last) return done
      await expect(this.task).not.toHaveAttribute('aria-labelledby', `${ex.id}-h`)
    }
    throw new Error('run did not finish in 100 tasks')
  }
}
