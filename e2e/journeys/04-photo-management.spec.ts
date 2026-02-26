import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/login.page'
import { PhotosPage } from '../pages/photos.page'
import { E2E_USER_EMAIL, E2E_USER_PASSWORD } from '../helpers/constants'

test.describe('Journey 4: Photo Management', () => {
  test('photo management page loads for authenticated user', async ({ page }) => {
    const loginPage = new LoginPage(page)
    const photosPage = new PhotosPage(page)

    // Login
    await loginPage.goto()
    await loginPage.loginWithPassword(E2E_USER_EMAIL, E2E_USER_PASSWORD)

    // Navigate to photos
    await photosPage.goto()

    // Should see photos page, premium gate, no business, or business selector
    const heading = page.getByTestId('photos-heading')
    const premiumGate = page.getByTestId('photos-premium-gate')
    const noBusiness = page.locator('text=No Business Listing')
    const businessSelector = page.locator('text=Choose a listing to manage photos for')
    await expect(
      heading.or(premiumGate).or(noBusiness).or(businessSelector)
    ).toBeVisible({ timeout: 15_000 })
  })
})
