import { test, expect } from '../fixtures'
import { openApp, setRole } from '../helpers/ui'

test('auth: переключение роли в dev', async ({ page }) => {
  await openApp(page, 'owner')
  await expect(page.getByTestId('role-toggle')).toBeVisible()
  await setRole(page, 'assistant')
  await expect(page.getByTestId('role-toggle')).toHaveValue('assistant')
})
