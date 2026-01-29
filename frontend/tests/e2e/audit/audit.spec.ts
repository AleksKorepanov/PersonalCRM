import { test, expect } from '../fixtures'
import { openApp, setRole } from '../helpers/ui'

test('audit: запись появляется после действия ассистента', async ({ page, api }) => {
  const contact = await api.createContact({ display_name: `E2E Аудит ${Date.now()}` })
  await api.createInteraction(
    contact.id,
    {
      type: 'message',
      occurred_at: new Date().toISOString(),
      summary: 'E2E аудит',
    },
    'assistant',
  )

  await openApp(page, 'owner')
  await page.getByTestId('nav-audit').click()
  await expect(page.getByTestId('audit-table')).toBeVisible()
  const rows = page.locator('tbody tr')
  await expect
    .poll(async () => {
      await page.getByTestId('audit-apply').click()
      return (await rows.count()) > 0
    }, { timeout: 20000 })
    .toBe(true)
  await rows.first().getByRole('button').click()
  await expect(page.getByTestId('audit-details')).toBeVisible()
})
