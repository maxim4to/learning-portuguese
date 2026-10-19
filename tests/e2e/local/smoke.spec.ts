/** Smoke: the local-mode app boots, navigates to a topic and takes one exercise answer by keyboard. */
import { expect, test } from '../../helpers/test'

test('home → course → topic → answer the first exercise', async ({ app, page, isMobile }) => {
  await app.goto('/')
  await expect(app.heading).toHaveText('Сегодня')

  await app.nav.open('Курс')
  await expect(page).toHaveURL(/\/syllabus$/)
  await app.main.getByRole('link', { name: /Ser и estar/ }).first().click()
  await expect(app.heading).toHaveText(/Ser и estar/)

  await page.getByRole('tab', { name: /Упражнения/ }).click()
  await expect(page).toHaveURL(/tab=exercises/)
  await expect(app.exercise.task).toContainText('Eu')

  // Desktop: keyboard only — Tab from the selected tab lands in the answer field.
  if (!isMobile) await page.keyboard.press('Tab')
  await app.exercise.typeAnswer('sou', { keyboardOnly: !isMobile })
  await expect(app.exercise.task.getByText('Верно!')).toBeVisible()
  await app.exercise.next({ keyboardOnly: !isMobile })
  await expect(app.exercise.answerField).toBeEnabled()
  await expect(app.exercise.answerField).toHaveValue('')

  // The in-progress run is kept per tab session and survives a reload.
  await page.reload()
  if (!isMobile) await expect(app.exercise.progressList()).toHaveAccessibleName('Пройдено 1 из 21')
  else await expect(page.getByText(/Задание 2/).first()).toBeVisible()
})
