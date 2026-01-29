import { test, expect } from '../fixtures'
import { openApp, setRole, waitForContactRow } from '../helpers/ui'

test('rbac: приватные/ограниченные контакты и аудит', async ({ page, api }) => {
  const privateContact = await api.createContact({
    display_name: `E2E Приват ${Date.now()}`,
    visibility: 'private',
  })
  const limitedContact = await api.createContact({
    display_name: `E2E Ограниченный ${Date.now()}`,
    visibility: 'limited',
  })

  await openApp(page, 'assistant')
  await page.getByTestId('nav-contacts').click()

  await expect(page.locator(`[data-testid="contact-row-${privateContact.id}"]`)).toHaveCount(0)
  await waitForContactRow(page, limitedContact.id)

  await page.getByTestId(`contact-open-${limitedContact.id}`).click()
  await expect(page.getByTestId('contact-limited-notice')).toBeVisible()

  await page.getByTestId('nav-audit').click()
  await expect(page.getByTestId('audit-no-access')).toBeVisible()
})
