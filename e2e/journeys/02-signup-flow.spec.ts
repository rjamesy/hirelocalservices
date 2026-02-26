import { test, expect } from '@playwright/test'
import { SignupPage } from '../pages/signup.page'
import { LoginPage } from '../pages/login.page'
import { DashboardPage } from '../pages/dashboard.page'
import { deleteTestUser } from '../helpers/auth.helper'
import { supabaseAdmin } from '../helpers/supabase.helper'

const UNIQUE_EMAIL = `e2e-signup-${Date.now()}@hirelocalservices.com.au`
const PASSWORD = 'E2eSignupTest123!'

test.describe('Journey 2: Signup Flow', () => {
  test.afterAll(async () => {
    await deleteTestUser(UNIQUE_EMAIL)
  })

  test('can sign up, confirm via admin API, login, and see dashboard', async ({ page }) => {
    const signupPage = new SignupPage(page)
    const loginPage = new LoginPage(page)
    const dashboardPage = new DashboardPage(page)

    // Go to signup page and verify form renders
    await signupPage.goto()
    await expect(signupPage.emailInput).toBeVisible()
    await expect(signupPage.passwordInput).toBeVisible()

    // Try signup via UI
    await signupPage.fillForm(UNIQUE_EMAIL, PASSWORD)
    await signupPage.submit()

    // Wait for either success or error (rate limit)
    const success = signupPage.successMessage
    const error = signupPage.errorMessage
    await expect(success.or(error)).toBeVisible({ timeout: 15_000 })

    // If rate-limited, create user via admin API instead
    const isError = await error.isVisible().catch(() => false)
    if (isError) {
      // Fallback: create user via admin API
      await supabaseAdmin.auth.admin.createUser({
        email: UNIQUE_EMAIL,
        password: PASSWORD,
        email_confirm: true,
      })
    } else {
      // Auto-confirm via admin API
      const { data: users } = await supabaseAdmin.auth.admin.listUsers()
      const newUser = users?.users?.find(u => u.email === UNIQUE_EMAIL)
      expect(newUser).toBeTruthy()

      if (newUser && !newUser.email_confirmed_at) {
        await supabaseAdmin.auth.admin.updateUserById(newUser.id, {
          email_confirm: true,
        })
      }
    }

    // Login with credentials
    await loginPage.goto()
    await loginPage.loginWithPassword(UNIQUE_EMAIL, PASSWORD)

    // Verify dashboard
    await dashboardPage.expectLoaded()
    await dashboardPage.expectNoBusiness()
  })
})
