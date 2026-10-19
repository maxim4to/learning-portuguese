/** @a11y smoke: axe on the home page (WCAG 2.1 A/AA), both themes. Full per-route coverage: workstream E. */
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '../../helpers/test'

for (const theme of ['light', 'dark'] as const) {
  test(`home has no axe violations (${theme}) @a11y`, async ({ app, page, seed }) => {
    await seed({ theme })
    await app.goto('/')
    await expect(app.heading).toBeVisible()
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(violations.map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)).toEqual([])
  })
}
