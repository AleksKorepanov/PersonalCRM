import { test, expect } from '../fixtures'
import { openApp } from '../helpers/ui'

test('smoke: приложение открывается и меню доступно', async ({ page }) => {
  await openApp(page, 'owner')

  await expect(page.getByTestId('nav-contacts')).toBeVisible()
  await expect(page.getByTestId('nav-reminders')).toBeVisible()
  await expect(page.getByTestId('nav-introductions')).toBeVisible()
  await expect(page.getByTestId('nav-projects')).toBeVisible()
  await expect(page.getByTestId('nav-strategy')).toBeVisible()
  await expect(page.getByTestId('nav-week')).toBeVisible()
  await expect(page.getByTestId('nav-audit')).toBeVisible()

  await expect(page.getByTestId('top-search')).toBeVisible()
  await expect(page.getByTestId('role-indicator')).toBeVisible()
  await expect(page.getByTestId('create-button')).toBeVisible()
})
