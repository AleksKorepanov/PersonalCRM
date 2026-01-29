import { test, expect } from '../fixtures'
import { openApp, waitForContactRow } from '../helpers/ui'

test('reminders: создать из карточки и увидеть в списке', async ({ page, api }) => {
  const contact = await api.createContact({ display_name: `E2E Напоминание ${Date.now()}` })
  await openApp(page, 'owner')
  await page.getByTestId('nav-contacts').click()
  await waitForContactRow(page, contact.id)
  await page.getByTestId(`contact-open-${contact.id}`).click()

  await page.getByTestId('add-reminder').click()
  await page.getByTestId('reminder-due').fill('2026-01-21T10:00')
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/v1/reminders') && res.request().method() === 'POST'),
    page.getByTestId('reminder-save').click(),
  ])
  const created = await response.json()
  const reminderId = created.id as string

  await expect(page.getByTestId('toast-item')).toHaveAttribute('data-type', 'success')

  await page.getByTestId('nav-reminders').click()
  await expect(page.getByTestId(`reminder-row-${reminderId}`)).toBeVisible()
})
