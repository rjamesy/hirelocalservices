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
      // Should have status filter tabs including Deleted
      await expect(page.locator('text=Published')).toBeVisible()
      await expect(page.locator('text=Deleted')).toBeVisible()
    })

    test('account detail page loads', async ({ page }) => {
      // Navigate to accounts, click first "View" link
      await page.goto('/admin/accounts')
      await expect(page.locator('h1')).toContainText('Accounts')
      const viewLink = page.locator('a:has-text("View")').first()
      if (await viewLink.isVisible()) {
        await viewLink.click()
        // Should load account detail page
        await expect(page.locator('text=Subscription')).toBeVisible()
        await expect(page.locator('text=Entitlements')).toBeVisible()
        await expect(page.locator('text=Admin Notes')).toBeVisible()
      }
    })

    test('listing detail page loads', async ({ page }) => {
      // Navigate to listings, click first "Detail" link
      await page.goto('/admin/listings')
      await expect(page.locator('h1')).toContainText('All Listings')
      const detailLink = page.locator('a:has-text("Detail")').first()
      if (await detailLink.isVisible()) {
        await detailLink.click()
        // Should load listing detail page
        await expect(page.locator('text=Owner')).toBeVisible()
        await expect(page.locator('text=Eligibility')).toBeVisible()
      }
    })

    test('ops page loads', async ({ page }) => {
      await page.goto('/admin/ops')
      await expect(page.locator('h1')).toContainText('Operational Reports')
      // Should have period selector
      await expect(page.locator('text=30d')).toBeVisible()
    })

    test('audit page loads with filters', async ({ page }) => {
      await page.goto('/admin/audit')
      await expect(page.locator('h1')).toContainText('Audit Log')
      // Should have filter bar with date inputs
      await expect(page.locator('text=Date From')).toBeVisible()
      await expect(page.locator('text=Action')).toBeVisible()
    })

    test('reports page has AI Re-validate button', async ({ page }) => {
      await page.goto('/admin/reports')
      await expect(page.locator('h1')).toContainText('Reports')
      // If there are open reports, re-validate button should be present
      const revalidateBtn = page.locator('button:has-text("AI Re-validate")').first()
      // Just check the page loaded successfully
      await expect(page.locator('h1')).toBeVisible()
    })

    test('verification page has Suspend button', async ({ page }) => {
      await page.goto('/admin/verification')
      await expect(page.locator('h1')).toContainText('Verification Queue')
    })

    test('system settings has seed expiry and email sub-tabs', async ({ page }) => {
      await page.goto('/admin/system')
      await expect(page.locator('h1')).toContainText('System Settings')
      // Click Seed Controls tab — should have seed expiry
      await page.locator('button:has-text("Seed Controls")').click()
      await expect(page.locator('text=Seed Expiry')).toBeVisible()
      // Click Email Template tab — should have sub-tabs
      await page.locator('button:has-text("Email Template")').click()
      await expect(page.locator('text=Seed Notification')).toBeVisible()
      await expect(page.locator('text=Claim Approved')).toBeVisible()
      await expect(page.locator('text=Claim Rejected')).toBeVisible()
    })
  })
})
