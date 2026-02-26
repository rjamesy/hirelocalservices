export const BASE_URL = process.env.BASE_URL || 'http://localhost:3001'
export const E2E_USER_EMAIL = process.env.E2E_USER_EMAIL || 'e2e-user@hirelocalservices.com.au'
export const E2E_USER_PASSWORD = process.env.E2E_USER_PASSWORD || 'E2eTestPassword123!'
export const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'e2e-admin@hirelocalservices.com.au'
export const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'E2eAdminPassword123!'
export const TEST_PREFIX = 'e2e-journey'
export const TIMEOUTS = {
  navigation: 15_000,
  action: 10_000,
  expect: 10_000,
} as const
