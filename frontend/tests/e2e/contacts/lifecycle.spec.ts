import { test, expect } from '../fixtures'
import { openApp, refreshContacts } from '../helpers/ui'

test('full lifecycle: import, merge, interaction, today', async ({ page, api }) => {
  const csvContent = [
    'name,email,phone,company,tags',
    'Иван Иванов,dup@example.com,+79990001111,Acme,"vip"',
    'Иван Иванов,dup@example.com,+79990002222,Acme,"vip"',
    'Петр Петров,unique@example.com,+79990003333,Acme,"lead"',
  ].join('\n')

  await openApp(page, 'owner')
  await page.getByTestId('nav-contacts').click()

  await page.getByTestId('contacts-import-open').click()
  await expect(page.getByTestId('contacts-import-modal')).toBeVisible()
  await page.getByTestId('contacts-import-file').setInputFiles({
    name: 'contacts-duplicates.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csvContent, 'utf-8'),
  })
  await page.getByTestId('contacts-import-submit').click()
  await expect(page.getByTestId('contacts-import-report')).toBeVisible()
  await page.getByTestId('contacts-import-close').click()

  await page.getByTestId('nav-duplicates').click()
  await expect(page.getByTestId('duplicates-list')).toBeVisible()
  await page.getByTestId('duplicates-open-0').click()
  await expect(page.getByTestId('duplicates-modal')).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByTestId('duplicates-merge').click()
  await expect(page.getByTestId('duplicates-modal')).toBeHidden()

  await page.getByTestId('nav-contacts').click()
  await refreshContacts(page)
  const firstRow = page.locator('[data-testid^="contact-row-"]').first()
  await expect(firstRow).toBeVisible()
  const rowTestId = await firstRow.getAttribute('data-testid')
  const contactId = rowTestId?.replace('contact-row-', '')
  expect(contactId).toBeTruthy()
  await page.getByTestId(`contact-open-${contactId}`).click()

  await expect(page.getByTestId('contact-header')).toBeVisible()
  await page.getByTestId('tab-timeline').click()
  await page.getByTestId('add-interaction').click()
  await expect(page.getByTestId('timeline-add-modal')).toBeVisible()
  await page.getByTestId('interaction-notes').fill('Тестовое взаимодействие')
  await page.getByTestId('interaction-save').click()
  await expect(page.getByTestId('timeline-add-modal')).toBeHidden()
  await expect
    .poll(async () => page.locator('[data-testid^="timeline-item-"]').count(), { timeout: 20000 })
    .toBeGreaterThan(0)

  await api.createReminder({
    contact_id: contactId as string,
    title: 'Напоминание для сегодня',
    due_at: new Date().toISOString(),
    type: 'follow_up',
  })
  await page.getByTestId('nav-reminders').click()
  await page.getByTestId('reminders-refresh').click()

  await page.getByTestId('nav-today').click()
  await expect(page.getByTestId('today-page')).toBeVisible()
  await expect(page.getByTestId('today-reminders-section')).toBeVisible()
  const reminderItem = page.locator('[data-testid^="today-reminder-"]').first()
  await expect(reminderItem).toBeVisible()
  const reminderTestId = await reminderItem.getAttribute('data-testid')
  const reminderId = reminderTestId?.replace('today-reminder-', '')
  if (reminderId) {
    await expect(page.getByTestId(`today-reminder-done-${reminderId}`)).toBeVisible()
  }
  await expect(page.getByTestId('today-overdue-section')).toBeVisible()
  await expect(page.getByTestId('today-introductions-section')).toBeVisible()
})
