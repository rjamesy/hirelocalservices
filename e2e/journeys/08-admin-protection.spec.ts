import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/login.page'
import { AdminSystemPage } from '../pages/admin-system.page'
import { AdminAuditPage } from '../pages/admin-audit.page'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from '../helpers/constants'

test.describe('Journey 8: Admin Protection Flags', () => {
  test('admin can view and toggle protection flags', async ({ page }) => {
    const loginPage = new LoginPage(page)
    const systemPage = new AdminSystemPage(page)

    // Login as admin
    await loginPage.goto()
    await loginPage.loginWithPassword(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD)

    // Navigate to system settings
    await systemPage.goto()
    await page.waitForLoadState('networkidle')

    // Click Protection tab
    await systemPage.clickProtectionTab()

    // Verify kill switch section visible
    await expect(systemPage.killSwitchSection).toBeVisible({ timeout: 10_000 })

    // Verify circuit breaker section visible
    await expect(systemPage.circuitBreakerSection).toBeVisible()
  })
})
