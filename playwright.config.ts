import { defineConfig } from '@playwright/test'
import dotenv from 'dotenv'

// Load .env.test first, fall back to .env.local
dotenv.config({ path: '.env.test' })
dotenv.config({ path: '.env.local' })

const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
    },
  },
  retries: isCI ? 2 : 1,
  workers: isCI ? 1 : undefined,
  globalSetup: './e2e/helpers/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  reporter: isCI ? [['html'], ['github']] : [['html']],
  webServer: {
    command: 'npm run start -- -p 3001',
    port: 3001,
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
})
