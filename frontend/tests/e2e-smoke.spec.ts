import { test, expect } from '@playwright/test'

test('smoke: создать контакт, добавить interaction, увидеть таймлайн', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('tab-contacts').click()
  await page.getByTestId('contact-display-name').fill('Контакт для e2e')
  await page.getByTestId('contact-create').click()

  await expect(page.getByTestId('contacts-list')).toContainText('Контакт для e2e')

  const openButtons = page.getByRole('button', { name: 'Открыть' })
  await openButtons.first().click()

  await expect(page.getByRole('heading', { name: 'Таймлайн контакта' })).toBeVisible()

  await page.getByTestId('interaction-summary').fill('E2E взаимодействие')
  await page.getByTestId('interaction-create').click()

  await expect(page.getByTestId('timeline-list')).toContainText('E2E взаимодействие')
})
