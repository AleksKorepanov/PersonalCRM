import { test, expect } from '../fixtures'
import { openApp, waitForContactRow } from '../helpers/ui'

test('contact card: вкладки сохраняются в URL', async ({ page, api }) => {
  const contact = await api.createContact({ display_name: `E2E Карточка ${Date.now()}` })

  await openApp(page, 'owner')
  await page.getByTestId('nav-contacts').click()
  await waitForContactRow(page, contact.id)
  await page.getByTestId(`contact-open-${contact.id}`).click()

  await page.getByTestId('tab-timeline').click()
  await expect(page).toHaveURL(/tab=timeline/)

  await page.getByTestId('tab-profile').click()
  await expect(page).toHaveURL(/tab=profile/)
})
