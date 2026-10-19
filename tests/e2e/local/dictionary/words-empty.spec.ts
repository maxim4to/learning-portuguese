/** /words without data: empty state with the three ways in. */
import { expect, test } from '../../../helpers/test'

test('empty dictionary: explanation, «Добавить слово», «Тематические словари», «Импорт списка»', async ({ app, page }) => {
  await app.goto('/words')
  await expect(page.getByRole('region', { name: 'Словарь пока пуст' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Добавить слово' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Тематические словари' })).toHaveAttribute('href', /\/practice\/vocab$/)
  await page.getByRole('button', { name: 'Импорт списка' }).click()
  await expect(page.getByRole('dialog', { name: 'Импорт списка' })).toBeVisible()
})
