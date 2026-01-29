import { test, expect } from '../fixtures'
import { openApp, waitForContactRow } from '../helpers/ui'

test('contacts: создание, поиск, редактирование', async ({ page, api }) => {
  await openApp(page, 'owner')
  await page.getByTestId('nav-contacts').click()

  const name = `E2E Контакт ${Date.now()}`
  await page.getByTestId('contact-create').click()
  await page.getByTestId('contact-form-name').fill(name)
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/v1/contacts') && res.request().method() === 'POST'),
    page.getByTestId('contact-save').click(),
  ])

  const created = await response.json()
  const createdId = created.id as string
  await expect(page.getByTestId(`contact-row-${createdId}`)).toBeVisible()

  const extra = await api.createContact({ display_name: `E2E Другой ${Date.now()}` })
  await page.reload()
  await page.getByTestId('top-search').fill(name)
  await expect(page.getByTestId(`contact-row-${createdId}`)).toBeVisible()
  await expect(page.getByTestId(`contact-row-${extra.id}`)).toBeHidden()

  await page.getByTestId(`contact-open-${createdId}`).click()
  await page.getByTestId('contact-edit').click()
  await page.getByTestId('contact-edit-name').fill(`${name} обновлён`)
  await page.getByTestId('contact-edit-save').click()
  await expect(page.getByTestId('contact-name')).toContainText('обновлён')

  await api.deleteContact(createdId)
})

test('contacts: удаление скрывает контакт из списка', async ({ page, api }) => {
  const contact = await api.createContact({ display_name: `E2E Удаление ${Date.now()}` })
  await openApp(page, 'owner')
  await page.getByTestId('nav-contacts').click()
  await waitForContactRow(page, contact.id)

  await api.deleteContact(contact.id)
  await page.reload()
  await expect(page.locator(`[data-testid="contact-row-${contact.id}"]`)).toHaveCount(0)
})
