import { test, expect } from '../fixtures'
import { openApp, waitForContactRow, waitForIntroductionRow } from '../helpers/ui'

test('introductions: создать и скопировать текст', async ({ page, api }) => {
  const contactA = await api.createContact({ display_name: `E2E Интро A ${Date.now()}` })
  const contactB = await api.createContact({ display_name: `E2E Интро B ${Date.now()}` })

  await openApp(page, 'owner')
  await page.getByTestId('nav-contacts').click()
  await waitForContactRow(page, contactA.id)
  await page.getByTestId(`contact-open-${contactA.id}`).click()

  await page.getByTestId('add-introduction').click()
  await page.getByTestId('intro-target').fill('E2E Интро B')
  await page.getByTestId(`intro-target-${contactB.id}`).click()
  await page.getByTestId('intro-goal').fill('Познакомить по проекту')

  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/v1/introductions') && res.request().method() === 'POST'),
    page.getByTestId('intro-save').click(),
  ])
  const created = await response.json()
  const introId = created.id as string

  await expect(page.getByTestId('toast-item')).toHaveAttribute('data-type', 'success')

  await waitForIntroductionRow(page, introId)
  await page.getByTestId(`intro-open-${introId}`).click()
  await page.getByTestId('intro-copy-text').click()

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboardText.length).toBeGreaterThan(0)
})
