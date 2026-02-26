import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/login.page'
import { AdminVerificationPage } from '../pages/admin-listings.page'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, TEST_PREFIX } from '../helpers/constants'
import { supabaseAdmin } from '../helpers/supabase.helper'

test.describe('Journey 7: Admin Verification', () => {
  let testBusinessId: string | null = null

  test.beforeAll(async () => {
    // Seed a pending business
    const { data, error } = await supabaseAdmin
      .from('businesses')
      .insert({
        name: `${TEST_PREFIX}-pending-verify`,
        slug: `${TEST_PREFIX}-pending-verify-${Date.now()}`,
        description: `${TEST_PREFIX} pending verification test`,
        status: 'published',
        verification_status: 'pending',
        listing_source: 'manual',
        billing_status: 'active',
      })
      .select()
      .single()

    if (!error) testBusinessId = data.id
  })

  test.afterAll(async () => {
    if (testBusinessId) {
      await supabaseAdmin.from('verification_jobs').delete().eq('business_id', testBusinessId)
      await supabaseAdmin.from('businesses').delete().eq('id', testBusinessId)
    }
  })

  test('admin can view verification queue', async ({ page }) => {
    const loginPage = new LoginPage(page)

    // Login as admin
    await loginPage.goto()
    await loginPage.loginWithPassword(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD)

    // Navigate to verification page
    await page.goto('/admin/verification')
    await page.waitForLoadState('networkidle')

    // Should see either queue items or empty state
    const queueItem = page.locator('text=Approve')
    const emptyState = page.locator('text=No businesses pending verification')
    await expect(queueItem.first().or(emptyState)).toBeVisible({ timeout: 15_000 })
  })
})
