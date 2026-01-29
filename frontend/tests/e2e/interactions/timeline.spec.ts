import { test, expect } from '../fixtures'
import { openApp, waitForContactRow } from '../helpers/ui'

test('timeline: добавить взаимодействие и фильтровать', async ({ page, api }) => {
  const contact = await api.createContact({ display_name: `E2E Таймлайн ${Date.now()}` })
  await openApp(page, 'owner')
  await page.getByTestId('nav-contacts').click()
  await waitForContactRow(page, contact.id)
  await page.getByTestId(`contact-open-${contact.id}`).click()

  await page.getByTestId('tab-timeline').click()
  await page.getByTestId('add-interaction').click()
  await page.getByTestId('interaction-notes').fill('Заметка для таймлайна')
  await page.getByTestId('interaction-save').click()

  await expect(page.getByTestId('timeline-list')).toBeVisible()

  await page.getByTestId('timeline-filter-message').check()
  await page.getByTestId('timeline-filter-period').selectOption('30')
  await expect(page.getByTestId('timeline-list')).toBeVisible()
})
