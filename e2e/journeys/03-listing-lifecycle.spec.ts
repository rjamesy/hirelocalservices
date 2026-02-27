import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/login.page'
import { DashboardPage } from '../pages/dashboard.page'
import { ListingPage } from '../pages/listing.page'
import { E2E_USER_EMAIL, E2E_USER_PASSWORD, TEST_PREFIX } from '../helpers/constants'
import { supabaseAdmin } from '../helpers/supabase.helper'

test.describe('Journey 3: Listing Lifecycle', () => {
  test.afterAll(async () => {
    // Cleanup any created businesses
    const { data: businesses } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .like('name', `${TEST_PREFIX}-lifecycle%`)

    if (businesses?.length) {
      const ids = businesses.map(b => b.id)
      await supabaseAdmin.from('business_locations').delete().in('business_id', ids)
      await supabaseAdmin.from('business_categories').delete().in('business_id', ids)
      await supabaseAdmin.from('photos').delete().in('business_id', ids)
      await supabaseAdmin.from('testimonials').delete().in('business_id', ids)
      await supabaseAdmin.from('verification_jobs').delete().in('business_id', ids)
      await supabaseAdmin.from('businesses').delete().in('id', ids)
    }
  })

  test('can create listing through multi-step wizard', async ({ page }) => {
    const loginPage = new LoginPage(page)
    const listingPage = new ListingPage(page)

    // Login
    await loginPage.goto()
    await loginPage.loginWithPassword(E2E_USER_EMAIL, E2E_USER_PASSWORD)

    // Navigate to listing page — may show business selector if user has multiple businesses
    await page.goto('/dashboard/listing')
    await page.waitForLoadState('networkidle')

    // Handle multi-business selector: click "Create New" if visible, or first existing listing
    const createNewBtn = page.locator('text=Create New Listing')
    const businessSelector = page.locator('text=Choose a listing to edit')
    if (await businessSelector.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Multi-business user — click create new if available, else pick first
      if (await createNewBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await createNewBtn.click()
      } else {
        // Pick first listing to edit
        await page.locator('[class*="rounded-lg"][class*="border"]').filter({ hasText: TEST_PREFIX }).first().click()
      }
      await page.waitForLoadState('networkidle')
    }

    // Fill step 1 — Business Details
    await listingPage.fillStep1({
      name: `${TEST_PREFIX}-lifecycle-test`,
      description: 'E2E test listing for lifecycle journey. Professional plumbing services across Brisbane.',
      phone: '0400111222',
      email: 'lifecycle@test.com',
    })
    await listingPage.saveAndContinue()

    // Wait for step 2 transition
    await page.waitForTimeout(1000)

    // Step 2 — Categories (select first available)
    await listingPage.selectCategories()
    await listingPage.saveAndContinue()

    // Wait for step 3 transition
    await page.waitForTimeout(1000)

    // Step 3 — Location
    await listingPage.fillLocation('Brisbane', 'QLD', '4000')
    await listingPage.saveAndContinue()

    // Steps 4 & 5 — skip photos and testimonials
    await page.waitForTimeout(500)
    await listingPage.saveAndContinue() // skip photos
    await page.waitForTimeout(500)
    await listingPage.saveAndContinue() // skip testimonials

    // Step 6 — Preview should be visible
    await expect(page.locator('text=Preview Your Listing')).toBeVisible({ timeout: 10_000 })
  })
})
