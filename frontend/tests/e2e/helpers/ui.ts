import { expect, type Page } from '@playwright/test'

type Role = 'owner' | 'assistant'

export async function openApp(page: Page, role: Role = 'owner') {
  await page.addInitScript((value) => {
    window.localStorage.setItem('debugRole', value)
  }, role)
  await page.goto('/')
}

export async function setRole(page: Page, role: Role) {
  const toggle = page.getByTestId('role-toggle')
  if (await toggle.count()) {
    await toggle.selectOption(role)
  } else {
    await page.addInitScript((value) => {
      window.localStorage.setItem('debugRole', value)
    }, role)
    await page.reload()
  }
}

export async function refreshContacts(page: Page) {
  const refresh = page.getByTestId('contacts-refresh')
  if (await refresh.count()) {
    await refresh.click()
  }
}

export async function waitForContactRow(page: Page, contactId: string) {
  await expect
    .poll(async () => {
      const search = page.getByTestId('top-search')
      if (await search.count()) {
        await search.fill('')
      }
      await refreshContacts(page)
      return page.getByTestId(`contact-row-${contactId}`).count()
    }, { timeout: 20000 })
    .toBeGreaterThan(0)
  await page.getByTestId(`contact-row-${contactId}`).waitFor({ state: 'visible', timeout: 5000 })
}

export async function waitForIntroductionRow(page: Page, introId: string) {
  await expect
    .poll(async () => {
      await page.getByTestId('nav-introductions').click()
      return page.getByTestId(`introduction-row-${introId}`).count()
    }, { timeout: 20000 })
    .toBeGreaterThan(0)
}
