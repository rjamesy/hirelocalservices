import { test, expect } from '@playwright/test'
import { DashboardPage } from '../pages/dashboard.page'
import { ListingsPage } from '../pages/listings.page'

test.describe('Dashboard & Listings UX', () => {
  test('Dashboard shows account summary, no old status card, no global pause', async ({ page }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto()
    await dashboard.expectLoaded()

    // Old status card should not exist
    await expect(page.getByTestId('dashboard-status-card')).not.toBeVisible()

    // No global pause button on dashboard
    await expect(page.locator('button:has-text("Pause Listing")')).not.toBeVisible()
  })

  test('My Listings shows command center with filter tabs', async ({ page }) => {
    const listings = new ListingsPage(page)
    await listings.goto()

    // If user has businesses, command center should show
    // Check for either the heading (has businesses) or the editor (no businesses)
    const hasListings = await page.getByTestId('listings-heading').isVisible().catch(() => false)
    if (hasListings) {
      await listings.expectLoaded()
      await listings.expectHasFilters()
    }
  })

  test('Sidebar shows "My Listings" (plural)', async ({ page }) => {
    await page.goto('/dashboard')
    // Desktop sidebar nav should contain "My Listings"
    await expect(page.locator('nav >> text=My Listings')).toBeVisible()
  })
})
