import { test, expect } from '../fixtures'
import { openApp } from '../helpers/ui'

test('projects: страница доступна', async ({ page }) => {
  await openApp(page, 'owner')
  await page.getByTestId('nav-projects').click()
  await expect(page.getByTestId('projects-page')).toBeVisible()
})
