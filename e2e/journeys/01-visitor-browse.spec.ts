import { test, expect } from '@playwright/test'
import { HomePage } from '../pages/home.page'
import { SearchPage } from '../pages/search.page'
import { BusinessDetailPage } from '../pages/business-detail.page'

test.describe('Journey 1: Visitor Browse', () => {
  test('can browse homepage, search, and view a business', async ({ page }) => {
    const homePage = new HomePage(page)
    const searchPage = new SearchPage(page)
    const businessDetail = new BusinessDetailPage(page)

    // Load homepage
    await homePage.goto()
    await homePage.expectLoaded()

    // Verify key sections
    await expect(homePage.categoriesSection).toBeVisible()
    await expect(homePage.howItWorksSection).toBeVisible()
    await expect(homePage.ctaSection).toBeVisible()

    // Search by location (Sydney)
    await searchPage.goto('suburb=Sydney&state=NSW&postcode=2000&radius=50')
    await searchPage.expectResultsOrEmpty()

    // If results exist, click first result
    const resultCount = await searchPage.getResultCount()
    if (resultCount > 0) {
      await searchPage.clickFirstResult()
      await page.waitForURL(/\/business\//)
      await businessDetail.expectLoaded()
    }
  })

  test('homepage has no 404 asset errors', async ({ page }) => {
    const failedRequests: string[] = []
    page.on('response', (response) => {
      if (response.status() === 404) failedRequests.push(response.url())
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const assetErrors = failedRequests.filter((u) => u.includes('.svg') || u.includes('.png'))
    expect(assetErrors).toHaveLength(0)
  })
})
