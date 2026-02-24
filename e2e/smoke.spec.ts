import { test, expect } from '@playwright/test'

// Helper: wait for React hydration by waiting for JS to fully load
// and the SearchBar to be interactive (client-side React attached)
async function waitForHydration(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle')
  // Wait for the SearchBar's submit button to be present (React has rendered)
  await expect(page.getByTestId('search-submit')).toBeVisible()
  // Give React time to attach event handlers after DOM paint
  await page.waitForTimeout(500)
}

test.describe('Smoke Tests', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/HireLocalServices/i)
    // Header/logo should be visible
    await expect(page.locator('header')).toBeVisible()
  })

  test('search page loads with guidance state', async ({ page }) => {
    await page.goto('/search')
    // Should not be a 500 error page
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
    // Guidance state should be visible (no search params)
    await expect(page.getByTestId('search-guidance')).toBeVisible()
  })

  test('category-only search is blocked', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    // Select a category
    await page.getByTestId('search-category').selectOption('cleaning')
    // Submit button should be disabled (no location or business name)
    await expect(page.getByTestId('search-submit')).toBeDisabled()
    // Validation message should be visible
    await expect(page.getByText('Enter a suburb or postcode, or search by business name.')).toBeVisible()
  })

  test('business name search works', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    // Click the input first, then type character by character to ensure React onChange fires
    const input = page.getByTestId('search-businessName')
    await input.click()
    await input.pressSequentially('Test', { delay: 50 })
    // Submit should now be enabled
    await expect(page.getByTestId('search-submit')).toBeEnabled()
    // Submit the form
    await page.getByTestId('search-submit').click()
    // Should navigate to search page and render results or empty state
    await page.waitForURL(/\/search\?/)
    const results = page.getByTestId('search-results')
    const empty = page.getByTestId('search-empty')
    // One of them should be visible
    await expect(results.or(empty)).toBeVisible()
  })

  test('location typeahead shows suggestions', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    // Type a known suburb character by character to trigger debounced fetch
    const input = page.getByTestId('search-location')
    await input.click()
    await input.pressSequentially('Greenbank', { delay: 30 })
    // Wait for suggestions to appear
    const suggestions = page.getByTestId('location-suggest-item')
    await expect(suggestions.first()).toBeVisible({ timeout: 10_000 })
    // Suggestions should contain state and postcode
    await expect(suggestions.first()).toContainText('QLD')
    await expect(suggestions.first()).toContainText('4124')
  })

  test('location selection enables radius', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    // Radius should be disabled initially
    await expect(page.getByTestId('search-radius')).toBeDisabled()
    // Type and select a location
    const input = page.getByTestId('search-location')
    await input.click()
    await input.pressSequentially('Greenbank', { delay: 30 })
    const suggestions = page.getByTestId('location-suggest-item')
    await expect(suggestions.first()).toBeVisible({ timeout: 10_000 })
    await suggestions.first().click()
    // Radius should now be enabled
    await expect(page.getByTestId('search-radius')).toBeEnabled()
  })

  test('location + category search works', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    // Select category
    await page.getByTestId('search-category').selectOption('cleaning')
    // Type and select location
    const input = page.getByTestId('search-location')
    await input.click()
    await input.pressSequentially('Greenbank', { delay: 30 })
    const suggestions = page.getByTestId('location-suggest-item')
    await expect(suggestions.first()).toBeVisible({ timeout: 10_000 })
    await suggestions.first().click()
    // Select radius
    await page.getByTestId('search-radius').selectOption('10')
    // Submit
    await page.getByTestId('search-submit').click()
    await page.waitForURL(/\/search\?/)
    // Page should render results or empty state (not an error)
    const results = page.getByTestId('search-results')
    const empty = page.getByTestId('search-empty')
    await expect(results.or(empty)).toBeVisible()
  })

  test('seed listing page loads and shows claim button', async ({ page }) => {
    // Search near Sydney CBD to find seed listings
    await page.goto('/search?suburb=Sydney&state=NSW&postcode=2000&radius=50')
    // Wait for results or empty state
    const results = page.getByTestId('search-results')
    const empty = page.getByTestId('search-empty')
    await expect(results.or(empty)).toBeVisible()

    // If there are results, click the first one and verify the business page loads
    const resultCount = await results.count()
    if (resultCount > 0) {
      // Click the first business card link
      const firstLink = results.locator('a[href^="/business/"]').first()
      await firstLink.click()
      await page.waitForURL(/\/business\//)

      // Page should not crash — verify the business name heading is visible
      await expect(page.locator('h1')).toBeVisible()
      // Should not show "Application error"
      await expect(page.locator('body')).not.toContainText('Application error')

      // Check for claim button or contact info (seed listings show claim button)
      const claimButton = page.locator('a[href^="/dashboard/claim/"]')
      const contactSection = page.locator('text=Contact Information')
      // One of these should be visible (claim or contact)
      await expect(claimButton.or(contactSection).first()).toBeVisible()
    }
  })

  test('claim page redirects to login for unauthenticated users', async ({ page }) => {
    // Navigate directly to a claim page — should redirect to login
    await page.goto('/dashboard/claim/00000000-0000-0000-0000-000000000000')
    // Middleware should redirect to /login
    await page.waitForURL(/\/login/)
    // Login page should render without crash
    await expect(page.locator('body')).not.toContainText('Application error')
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
  })

  // --- Middleware & Route Protection ---

  test('dashboard redirects to login with correct redirect param', async ({ page }) => {
    // Unauthenticated user visiting /dashboard should redirect to /login?redirect=%2Fdashboard
    await page.goto('/dashboard')
    await page.waitForURL(/\/login/)
    const url = new URL(page.url())
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('redirect')).toBe('/dashboard')
  })

  test('admin route redirects to login for unauthenticated users', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForURL(/\/login/)
    const url = new URL(page.url())
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('redirect')).toBe('/admin')
  })

  test('login page renders without crash after redirect', async ({ page }) => {
    await page.goto('/dashboard/settings')
    await page.waitForURL(/\/login/)
    // Login page should render properly
    await expect(page.locator('body')).not.toContainText('Application error')
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
    // Redirect param should be preserved for deep links
    const url = new URL(page.url())
    expect(url.searchParams.get('redirect')).toBe('/dashboard/settings')
  })

  // --- Search Safety ---

  test('location suggest API handles long input safely', async ({ request }) => {
    // Send a very long query string — should not crash, returns empty or truncated results
    const longQuery = 'A'.repeat(500)
    const response = await request.get(`/api/locations/suggest?q=${longQuery}`)
    expect(response.status()).toBe(200)
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('location suggest API handles short input gracefully', async ({ request }) => {
    // Single character should return empty array (minimum 2 chars required)
    const response = await request.get('/api/locations/suggest?q=A')
    expect(response.status()).toBe(200)
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBe(0)
  })

  // --- Homepage & Assets ---

  test('homepage has no missing asset errors (grid-pattern.svg)', async ({ page }) => {
    const failedRequests: string[] = []
    page.on('response', (response) => {
      if (response.status() === 404) failedRequests.push(response.url())
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // No 404s for assets
    const svgErrors = failedRequests.filter((u) => u.includes('.svg') || u.includes('.png'))
    expect(svgErrors).toHaveLength(0)
  })

  // --- Search Pagination ---

  test('search pagination preserves params without duplication', async ({ page }) => {
    // Navigate to search with location params
    await page.goto('/search?suburb=GREENBANK&state=QLD&postcode=4124&radius=25')
    // Wait for results or empty state
    const results = page.getByTestId('search-results')
    const empty = page.getByTestId('search-empty')
    await expect(results.or(empty)).toBeVisible()
    // Check the URL has no duplicate params
    const url = new URL(page.url())
    const stateParams = url.searchParams.getAll('state')
    expect(stateParams.length).toBeLessThanOrEqual(1)
    const suburbParams = url.searchParams.getAll('suburb')
    expect(suburbParams.length).toBeLessThanOrEqual(1)
  })

  // --- Admin System Settings ---

  test('admin system page redirects unauthenticated users', async ({ page }) => {
    await page.goto('/admin/system')
    await page.waitForURL(/\/login/)
    expect(new URL(page.url()).pathname).toBe('/login')
  })

  // --- Existing API test ---

  test('API locations suggest returns data', async ({ request }) => {
    const response = await request.get('/api/locations/suggest?q=Greenbank')
    expect(response.status()).toBe(200)
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    expect(data[0].suburb.toUpperCase()).toBe('GREENBANK')
    expect(data[0].state).toBe('QLD')
    expect(data[0].postcode).toBe('4124')
  })
})
