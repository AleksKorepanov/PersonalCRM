import { test as base, expect, type APIRequestContext } from '@playwright/test'
import { ApiHelper } from './helpers/api'

type Fixtures = {
  api: ApiHelper
}

export const test = base.extend<Fixtures>({
  api: async ({ request }, use) => {
    const api = new ApiHelper(request)
    await use(api)
    await api.cleanup()
  },
})

export { expect }
