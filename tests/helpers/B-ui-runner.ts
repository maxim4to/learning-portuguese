/**
 * Drives an ExerciseRunner to its end without caring about answers: «Не знаю» where it exists (typed kinds),
 * otherwise the first option (choice / listen-choice); then «Дальше» / «Завершить» (mouse clicks: the 250 ms
 * keyboard guard does not apply).
 */
import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

export async function skipThroughRunner(user: UserEvent, max = 30): Promise<number> {
  for (let n = 0; n < max; n++) {
    const skip = screen.queryByRole('button', { name: /^Не знаю/ })
    if (skip) await user.click(skip)
    else {
      const group = screen.getByRole('radiogroup', { name: 'Варианты ответа' })
      await user.click(within(group).getAllByRole('radio')[0])
    }
    const finish = screen.queryByRole('button', { name: 'Завершить' })
    if (finish) {
      await user.click(finish)
      return n + 1
    }
    await user.click(screen.getByRole('button', { name: 'Дальше' }))
  }
  throw new Error('runner did not finish')
}
