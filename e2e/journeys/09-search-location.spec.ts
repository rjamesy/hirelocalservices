import { test, expect } from '@playwright/test'
import { SearchPage } from '../pages/search.page'

test.describe('Journey 9: Search with Location Filter', () => {
  test('location search works via URL params', async ({ page }) => {
    const searchPage = new SearchPage(page)

    // Direct URL search for Sydney
    await searchPage.goto('suburb=Sydney&state=NSW&postcode=2000&radius=50')
    await searchPage.expectResultsOrEmpty()

    // Verify no error
    await expect(page.locator('body')).not.toContainText('Internal Server Error')

    // Verify URL params
    const url = new URL(page.url())
    expect(url.searchParams.get('suburb')).toBe('Sydney')
    expect(url.searchParams.get('state')).toBe('NSW')
  })

  test('search guidance shows when no params', async ({ page }) => {
    const searchPage = new SearchPage(page)
    await searchPage.goto()
    await searchPage.expectGuidance()
  })

  test('location typeahead shows suggestions', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('search-submit')).toBeVisible()
    await page.waitForTimeout(500)

    const input = page.getByTestId('search-location')
    await input.click()
    await input.pressSequentially('Greenbank', { delay: 30 })

    const suggestions = page.getByTestId('location-suggest-item')
    await expect(suggestions.first()).toBeVisible({ timeout: 10_000 })
    await expect(suggestions.first()).toContainText('QLD')
  })
})
