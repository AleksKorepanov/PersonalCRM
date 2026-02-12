import { test, expect } from '../fixtures'
import { openApp, refreshContacts, setRole, waitForContactRow } from '../helpers/ui'

const toLocalInputValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`
}

test('owner vs assistant: private and limited visibility', async ({ page, api }) => {
  const shared = await api.createContact({ display_name: 'Shared Contact', visibility: 'shared' })
  const limited = await api.createContact({ display_name: 'Limited Contact', visibility: 'limited' })
  const privateContact = await api.createContact({ display_name: 'Private Contact', visibility: 'private' })

  await openApp(page, 'owner')
  await page.getByTestId('nav-contacts').click()
  await waitForContactRow(page, shared.id)
  await waitForContactRow(page, limited.id)
  await waitForContactRow(page, privateContact.id)

  await setRole(page, 'assistant')
  await refreshContacts(page)
  await expect(page.getByTestId(`contact-row-${privateContact.id}`)).toHaveCount(0)
  await waitForContactRow(page, limited.id)
  await page.getByTestId(`contact-open-${limited.id}`).click()
  await expect(page.getByTestId('contact-limited-notice')).toBeVisible()
})

test('calendar import adds interaction to timeline', async ({ page, api }) => {
  const email = `calendar-${Date.now()}@example.com`
  const contact = await api.createContact({ display_name: 'Calendar Contact', emails: [email] })
  await api.importCalendar([
    {
      summary: 'Calendar Event',
      start: new Date().toISOString(),
      attendees: [email],
    },
  ])

  await openApp(page, 'owner')
  await page.getByTestId('nav-contacts').click()
  await waitForContactRow(page, contact.id)
  await page.getByTestId(`contact-open-${contact.id}`).click()
  await page.getByTestId('tab-timeline').click()

  const items = page.getByTestId('timeline-list').locator('[data-testid^="timeline-item-"]')
  await expect(items).toHaveCount(1)
})

test('next action uses overdue reminder', async ({ page, api }) => {
  const contact = await api.createContact({ display_name: 'Next Action Contact' })
  const dueAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  await api.createReminder({ contact_id: contact.id, due_at: dueAt })

  await openApp(page, 'owner')
  await page.getByTestId('nav-contacts').click()
  await waitForContactRow(page, contact.id)
  await page.getByTestId(`contact-open-${contact.id}`).click()

  await expect(page.getByTestId('next-action-card')).toHaveAttribute('data-action', 'reminders')
})

test('auto follow-up creates reminder', async ({ page, api }) => {
  const contact = await api.createContact({ display_name: 'Follow Up Contact' })

  await openApp(page, 'owner')
  await page.getByTestId('nav-contacts').click()
  await waitForContactRow(page, contact.id)
  await page.getByTestId(`contact-open-${contact.id}`).click()
  await page.getByTestId('tab-timeline').click()

  await page.getByTestId('add-interaction').click()
  await page.getByTestId('interaction-type').selectOption('message')
  await page.getByTestId('interaction-datetime').fill(toLocalInputValue(new Date()))
  await page.getByTestId('interaction-notes').fill('Follow up interaction')
  await page.getByTestId('interaction-save').click()

  await expect(page.getByTestId('follow-up-prompt')).toBeVisible()
  await page.getByTestId('follow-up-3').click()

  let reminderId = ''
  await expect
    .poll(async () => {
      const list = await api.listReminders()
      const found = list.data.find((item) => item.contact_id === contact.id)
      reminderId = found?.id ?? ''
      return reminderId
    })
    .not.toBe('')

  await page.getByTestId('nav-reminders').click()
  await expect(page.getByTestId(`reminder-row-${reminderId}`)).toBeVisible()
})

test('week panel reflects recent interaction', async ({ page, api }) => {
  const contact = await api.createContact({ display_name: 'Week Panel Contact' })
  await api.createInteraction(contact.id, {
    type: 'message',
    occurred_at: new Date().toISOString(),
    summary: 'Week panel interaction',
  })

  await openApp(page, 'owner')
  await page.getByTestId('nav-contacts').click()
  await waitForContactRow(page, contact.id)
  await page.getByTestId('nav-week').click()

  const stats = page.getByTestId('metrics-interactions')
  await expect(stats).toBeVisible()
  await expect
    .poll(async () => {
      const value = await stats.textContent()
      const [last7] = (value || '0 / 0').split('/').map((item) => Number(item.trim()))
      return last7
    })
    .toBeGreaterThan(0)
})
