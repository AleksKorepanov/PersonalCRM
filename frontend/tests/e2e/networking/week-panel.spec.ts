import { test, expect } from '../fixtures'
import { openApp, waitForContactRow } from '../helpers/ui'

test('networking: панель недели и очередь действий', async ({ page, api }) => {
  const contact = await api.createContact({
    display_name: `E2E Панель ${Date.now()}`,
    tags: ['tier:A'],
  })
  const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
  await api.createInteraction(contact.id, {
    type: 'message',
    occurred_at: oldDate,
    summary: 'Старое касание',
  })
  const reminder = await api.createReminder({
    contact_id: contact.id,
    due_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    title: 'Напоминание для очереди',
  })

  await openApp(page, 'owner')
  await page.getByTestId('nav-contacts').click()
  await waitForContactRow(page, contact.id)
  await page.getByTestId('nav-week').click()

  await expect(page.getByTestId('weekly-dashboard')).toBeVisible()
  await expect(page.getByTestId(`overdue-item-${contact.id}`)).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId(`queue-item-reminder-${reminder.id}`)).toBeVisible({ timeout: 20000 })

  const metricsText = await page.getByTestId('metrics-interactions').textContent()
  expect(metricsText).toMatch(/\d+\s*\/\s*\d+/)

  await page.getByTestId(`queue-item-reminder-${reminder.id}`).getByTestId('reminder-done').click()
  await expect(page.getByTestId(`queue-item-reminder-${reminder.id}`)).toHaveCount(0)
})
