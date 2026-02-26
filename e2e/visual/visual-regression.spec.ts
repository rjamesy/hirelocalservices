import { test, expect } from '@playwright/test'

test.describe('Visual Regression', () => {
  test('homepage hero', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('homepage-hero.png', {
      clip: { x: 0, y: 0, width: 1280, height: 800 },
    })
  })

  test('homepage full page', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('homepage-full.png', {
      fullPage: true,
    })
  })

  test('search guidance state', async ({ page }) => {
    await page.goto('/search')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('search-guidance.png')
  })

  test('login page', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('login-page.png')
  })

  test('signup page', async ({ page }) => {
    await page.goto('/signup')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('signup-page.png')
  })
})
