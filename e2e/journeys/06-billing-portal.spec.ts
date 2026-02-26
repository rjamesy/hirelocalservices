import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/login.page'
import { BillingPage } from '../pages/billing.page'
import { E2E_USER_EMAIL, E2E_USER_PASSWORD } from '../helpers/constants'

test.describe('Journey 6: Billing Portal', () => {
  test('billing page loads and shows plan information', async ({ page }) => {
    const loginPage = new LoginPage(page)
    const billingPage = new BillingPage(page)

    // Login
    await loginPage.goto()
    await loginPage.loginWithPassword(E2E_USER_EMAIL, E2E_USER_PASSWORD)

    // Navigate to billing
    await billingPage.goto()
    await billingPage.expectLoaded()

    // Should show either plan selection or current plan details
    const choosePlan = page.getByRole('heading', { name: 'Choose a Plan' })
    const billingHeading = page.getByRole('heading', { name: 'Billing' })
    await expect(choosePlan.or(billingHeading)).toBeVisible()
  })
})
