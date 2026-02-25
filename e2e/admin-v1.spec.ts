import { test, expect } from '@playwright/test'

test.describe('Admin v1', () => {
  test('admin routes redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/admin')
    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })

  test('admin accounts route redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/admin/accounts')
    await expect(page).toHaveURL(/\/login/)
  })

  test('admin listings route redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/admin/listings')
    await expect(page).toHaveURL(/\/login/)
  })

  // Note: The tests below require an authenticated admin session.
  // They serve as a placeholder for manual or CI-authenticated E2E tests.
  // In a CI environment, use Playwright's storageState to pre-authenticate.

  test.describe('authenticated admin', () => {
    // Skip these tests unless ADMIN_E2E_ENABLED env var is set
    test.skip(!process.env.ADMIN_E2E_ENABLED, 'Requires authenticated admin session')

    test('dashboard loads with stat cards', async ({ page }) => {
      await page.goto('/admin')
      await expect(page.locator('h1')).toContainText('Admin Dashboard')
      // Should have stat cards
      await expect(page.locator('text=Total Businesses')).toBeVisible()
      await expect(page.locator('text=Active Subscriptions')).toBeVisible()
    })

    test('accounts page loads', async ({ page }) => {
      await page.goto('/admin/accounts')
      await expect(page.locator('h1')).toContainText('Accounts')
      // Should have the search input
      await expect(page.locator('input[placeholder*="email"]')).toBeVisible()
    })

    test('listings page loads', async ({ page }) => {
      await page.goto('/admin/listings')
      await expect(page.locator('h1')).toContainText('All Listings')
      // Should have status filter tabs
      await expect(page.locator('text=Published')).toBeVisible()
    })
  })
})
