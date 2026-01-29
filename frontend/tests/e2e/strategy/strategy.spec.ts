import { test, expect } from '../fixtures'
import { openApp } from '../helpers/ui'

test('strategy: сохранение настроек каденций', async ({ page }) => {
  await openApp(page, 'owner')
  await page.getByTestId('nav-strategy').click()

  await page.getByTestId('cadence-a').fill('25')
  await page.getByTestId('cadence-save').click()
  await expect(page.getByTestId('toast-item')).toHaveAttribute('data-type', 'success')
})
