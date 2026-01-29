import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173'
const shouldStartWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER !== '1'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  webServer: shouldStartWebServer
    ? {
        command: 'docker compose up -d',
        url: baseURL,
        timeout: 120000,
        reuseExistingServer: !process.env.CI,
        cwd: path.resolve(__dirname, '..'),
      }
    : undefined,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
