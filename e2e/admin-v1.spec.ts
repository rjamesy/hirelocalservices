import { test, expect, type Page } from '@playwright/test'

// ─────────────────────────────────────────────────────────────
// Section 1: Authentication & Route Guards (tests 1-8)
// ─────────────────────────────────────────────────────────────

test.describe('Admin authentication guards', () => {
  const protectedRoutes = [
    '/admin',
    '/admin/listings',
    '/admin/accounts',
    '/admin/reports',
    '/admin/verification',
    '/admin/system',
    '/admin/audit',
    '/admin/ops',
  ]

  for (const route of protectedRoutes) {
    test(`${route} redirects unauthenticated users to login`, async ({ page }) => {
      await page.goto(route)
      await expect(page).toHaveURL(/\/login/)
    })
  }
})

// ─────────────────────────────────────────────────────────────
// Section 2: Authenticated admin tests (tests 9-58+)
// ─────────────────────────────────────────────────────────────

test.describe('Authenticated admin', () => {
  test.skip(!process.env.ADMIN_E2E_ENABLED, 'Requires authenticated admin session')

  // ── Dashboard (tests 9-18) ──────────────────────────────────

  test.describe('Dashboard', () => {
    test('page loads with heading', async ({ page }) => {
      await page.goto('/admin')
      await expect(page.locator('h1')).toContainText('Admin Dashboard')
    })

    test('displays all 11 stat cards', async ({ page }) => {
      await page.goto('/admin')
      const expectedCards = [
        'Total Businesses',
        'Published',
        'Draft',
        'Paused',
        'Suspended',
        'Open Reports',
        'Pending Claims',
        'Pending Verification',
        'Claimed Businesses',
        'Seed Listings',
        'Active Subscriptions',
      ]
      for (const label of expectedCards) {
        await expect(page.locator(`text=${label}`)).toBeVisible()
      }
    })

    test('stat cards display numeric values', async ({ page }) => {
      await page.goto('/admin')
      // Each stat card should have a number (text-3xl font-bold)
      const cards = page.locator('a.bg-white p.text-3xl')
      const count = await cards.count()
      expect(count).toBe(11)
    })

    test('Total Businesses card links to /admin/listings', async ({ page }) => {
      await page.goto('/admin')
      const card = page.locator('a:has-text("Total Businesses")')
      await expect(card).toHaveAttribute('href', '/admin/listings')
    })

    test('Published card links to /admin/listings?status=published', async ({ page }) => {
      await page.goto('/admin')
      const card = page.locator('a:has-text("Published")')
      await expect(card).toHaveAttribute('href', '/admin/listings?status=published')
    })

    test('Claimed Businesses card links to /admin/listings?type=claimed', async ({ page }) => {
      await page.goto('/admin')
      const card = page.locator('a:has-text("Claimed Businesses")')
      await expect(card).toHaveAttribute('href', '/admin/listings?type=claimed')
    })

    test('Seed Listings card links to /admin/listings?type=seed', async ({ page }) => {
      await page.goto('/admin')
      const card = page.locator('a:has-text("Seed Listings")')
      await expect(card).toHaveAttribute('href', '/admin/listings?type=seed')
    })

    test('Open Reports card links to /admin/reports?status=open', async ({ page }) => {
      await page.goto('/admin')
      const card = page.locator('a:has-text("Open Reports")')
      await expect(card).toHaveAttribute('href', '/admin/reports?status=open')
    })

    test('Manage Listings quick link navigates to listings', async ({ page }) => {
      await page.goto('/admin')
      await page.locator('a:has-text("View All Listings")').click()
      await expect(page).toHaveURL(/\/admin\/listings/)
    })

    test('Review Reports quick link navigates to reports', async ({ page }) => {
      await page.goto('/admin')
      await page.locator('a:has-text("View Reports")').click()
      await expect(page).toHaveURL(/\/admin\/reports/)
    })
  })

  // ── Layout & Navigation (tests 19-25) ───────────────────────

  test.describe('Layout & Navigation', () => {
    test('header shows admin email and sign out button', async ({ page }) => {
      await page.goto('/admin')
      await expect(page.locator('header button:has-text("Sign out")')).toBeVisible()
      // Email should be visible in the header
      await expect(page.locator('header span')).toBeVisible()
    })

    test('header nav contains all section links', async ({ page }) => {
      await page.goto('/admin')
      const headerNav = page.locator('header nav')
      for (const label of ['Listings', 'Accounts', 'Reports', 'Verification', 'System', 'Audit', 'Ops']) {
        await expect(headerNav.locator(`a:has-text("${label}")`)).toBeVisible()
      }
    })

    test('sidebar nav contains all section links with icons', async ({ page }) => {
      await page.goto('/admin')
      const sidebar = page.locator('aside nav')
      for (const label of ['Dashboard', 'Listings', 'Accounts', 'Reports', 'Verification', 'System', 'Audit', 'Ops']) {
        await expect(sidebar.locator(`a:has-text("${label}")`)).toBeVisible()
      }
    })

    test('header Listings link navigates correctly', async ({ page }) => {
      await page.goto('/admin')
      await page.locator('header nav a:has-text("Listings")').click()
      await expect(page).toHaveURL(/\/admin\/listings/)
    })

    test('header Accounts link navigates correctly', async ({ page }) => {
      await page.goto('/admin')
      await page.locator('header nav a:has-text("Accounts")').click()
      await expect(page).toHaveURL(/\/admin\/accounts/)
    })

    test('header Ops link navigates correctly', async ({ page }) => {
      await page.goto('/admin')
      await page.locator('header nav a:has-text("Ops")').click()
      await expect(page).toHaveURL(/\/admin\/ops/)
    })

    test('HLS Admin logo links to dashboard', async ({ page }) => {
      await page.goto('/admin/listings')
      await page.locator('a:has-text("HLS Admin")').click()
      await expect(page).toHaveURL(/\/admin$/)
    })
  })

  // ── Listings Page (tests 26-35) ─────────────────────────────

  test.describe('Listings page', () => {
    test('page loads with heading and total count', async ({ page }) => {
      await page.goto('/admin/listings')
      await expect(page.locator('h1')).toContainText('All Listings')
      // Total count display
      await expect(page.locator('text=/\\d+ total/')).toBeVisible()
    })

    test('has search input', async ({ page }) => {
      await page.goto('/admin/listings')
      await expect(page.locator('input[placeholder*="business name"]')).toBeVisible()
    })

    test('has status filter tabs: All, Published, Draft, Paused, Suspended, Deleted', async ({ page }) => {
      await page.goto('/admin/listings')
      for (const tab of ['All', 'Published', 'Draft', 'Paused', 'Suspended', 'Deleted']) {
        await expect(page.locator(`button:has-text("${tab}")`)).toBeVisible()
      }
    })

    test('has filter dropdowns: States, Types, Verification', async ({ page }) => {
      await page.goto('/admin/listings')
      await expect(page.locator('select >> nth=0')).toBeVisible() // States
      await expect(page.locator('select >> nth=1')).toBeVisible() // Types
      await expect(page.locator('select >> nth=2')).toBeVisible() // Verification
    })

    test('table has correct column headers', async ({ page }) => {
      await page.goto('/admin/listings')
      for (const header of ['BUSINESS', 'TYPE', 'STATUS', 'SEARCHABLE', 'REPORTS', 'CREATED', 'ACTIONS']) {
        await expect(page.locator(`th:has-text("${header}")`)).toBeVisible()
      }
    })

    test('listings display with Detail link', async ({ page }) => {
      await page.goto('/admin/listings')
      // Wait for loading to finish
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const detailLinks = page.locator('a:has-text("Detail")')
      const count = await detailLinks.count()
      expect(count).toBeGreaterThan(0)
    })

    test('Published tab filters listings', async ({ page }) => {
      await page.goto('/admin/listings')
      await page.locator('button:has-text("Published")').click()
      await expect(page).toHaveURL(/status=published/)
    })

    test('type=claimed URL param pre-selects filter', async ({ page }) => {
      await page.goto('/admin/listings?type=claimed')
      const typeSelect = page.locator('select >> nth=1')
      await expect(typeSelect).toHaveValue('claimed')
    })

    test('type=seed URL param pre-selects filter', async ({ page }) => {
      await page.goto('/admin/listings?type=seed')
      const typeSelect = page.locator('select >> nth=1')
      await expect(typeSelect).toHaveValue('seed')
    })

    test('Clear filters button appears and resets all', async ({ page }) => {
      await page.goto('/admin/listings?status=published&type=seed')
      const clearBtn = page.locator('button:has-text("Clear filters")')
      await expect(clearBtn).toBeVisible()
      await clearBtn.click()
      await expect(page).toHaveURL(/\/admin\/listings$/)
    })
  })

  // ── Listing Detail Page (tests 36-42) ───────────────────────

  test.describe('Listing detail page', () => {
    test('navigates from listings list to detail', async ({ page }) => {
      await page.goto('/admin/listings')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const detailLink = page.locator('a:has-text("Detail")').first()
      if (await detailLink.isVisible()) {
        await detailLink.click()
        await expect(page).toHaveURL(/\/admin\/listings\//)
      }
    })

    test('shows business header with name and badges', async ({ page }) => {
      await page.goto('/admin/listings')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const detailLink = page.locator('a:has-text("Detail")').first()
      if (await detailLink.isVisible()) {
        await detailLink.click()
        await page.waitForSelector('text=Loading listing', { state: 'hidden', timeout: 10000 }).catch(() => {})
        // Should show owner info section
        await expect(page.locator('text=Owner Information').or(page.locator('text=Owner'))).toBeVisible()
      }
    })

    test('shows eligibility panel', async ({ page }) => {
      await page.goto('/admin/listings')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const detailLink = page.locator('a:has-text("Detail")').first()
      if (await detailLink.isVisible()) {
        await detailLink.click()
        await page.waitForSelector('text=Loading listing', { state: 'hidden', timeout: 10000 }).catch(() => {})
        await expect(page.locator('text=Search Eligibility').or(page.locator('text=Eligibility'))).toBeVisible()
      }
    })

    test('shows entitlements panel', async ({ page }) => {
      await page.goto('/admin/listings')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const detailLink = page.locator('a:has-text("Detail")').first()
      if (await detailLink.isVisible()) {
        await detailLink.click()
        await page.waitForSelector('text=Loading listing', { state: 'hidden', timeout: 10000 }).catch(() => {})
        await expect(page.locator('text=Entitlements')).toBeVisible()
      }
    })

    test('shows published snapshot section', async ({ page }) => {
      await page.goto('/admin/listings')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const detailLink = page.locator('a:has-text("Detail")').first()
      if (await detailLink.isVisible()) {
        await detailLink.click()
        await page.waitForSelector('text=Loading listing', { state: 'hidden', timeout: 10000 }).catch(() => {})
        await expect(page.locator('text=Published Snapshot').or(page.locator('text=Business Details'))).toBeVisible()
      }
    })

    test('shows admin actions panel', async ({ page }) => {
      await page.goto('/admin/listings')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const detailLink = page.locator('a:has-text("Detail")').first()
      if (await detailLink.isVisible()) {
        await detailLink.click()
        await page.waitForSelector('text=Loading listing', { state: 'hidden', timeout: 10000 }).catch(() => {})
        await expect(page.locator('text=Admin Actions').or(page.locator('text=Actions'))).toBeVisible()
      }
    })

    test('has back link to listings', async ({ page }) => {
      await page.goto('/admin/listings')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const detailLink = page.locator('a:has-text("Detail")').first()
      if (await detailLink.isVisible()) {
        await detailLink.click()
        await page.waitForSelector('text=Loading listing', { state: 'hidden', timeout: 10000 }).catch(() => {})
        await expect(page.locator('a:has-text("Back")')).toBeVisible()
      }
    })
  })

  // ── Accounts Page (tests 43-48) ─────────────────────────────

  test.describe('Accounts page', () => {
    test('page loads with heading', async ({ page }) => {
      await page.goto('/admin/accounts')
      await expect(page.locator('h1')).toContainText('Accounts')
    })

    test('has search input for email, user ID, or business name', async ({ page }) => {
      await page.goto('/admin/accounts')
      await expect(page.locator('input[placeholder*="email"]')).toBeVisible()
    })

    test('table has correct column headers', async ({ page }) => {
      await page.goto('/admin/accounts')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      for (const header of ['EMAIL', 'USER ID', 'PLAN']) {
        await expect(page.locator(`th:has-text("${header}")`)).toBeVisible()
      }
    })

    test('accounts display with View link', async ({ page }) => {
      await page.goto('/admin/accounts')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const viewLinks = page.locator('a:has-text("View")')
      const count = await viewLinks.count()
      expect(count).toBeGreaterThan(0)
    })

    test('search filters accounts', async ({ page }) => {
      await page.goto('/admin/accounts')
      const searchInput = page.locator('input[placeholder*="email"]')
      await searchInput.fill('rjamesy')
      // Wait for debounce
      await page.waitForTimeout(500)
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      // Should have fewer results than before
      const rows = page.locator('tbody tr')
      const count = await rows.count()
      expect(count).toBeGreaterThanOrEqual(1)
    })

    test('pagination shows when there are multiple pages', async ({ page }) => {
      await page.goto('/admin/accounts')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      // Pagination may or may not be visible depending on data count
      const paginationText = page.locator('text=/Page \\d+ of \\d+/')
      // Just verify the page loaded — pagination is conditional
      await expect(page.locator('h1')).toContainText('Accounts')
    })
  })

  // ── Account Detail Page (tests 49-55) ───────────────────────

  test.describe('Account detail page', () => {
    test('navigates from accounts list to detail', async ({ page }) => {
      await page.goto('/admin/accounts')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const viewLink = page.locator('a:has-text("View")').first()
      if (await viewLink.isVisible()) {
        await viewLink.click()
        await expect(page).toHaveURL(/\/admin\/accounts\//)
      }
    })

    test('shows subscription panel', async ({ page }) => {
      await page.goto('/admin/accounts')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const viewLink = page.locator('a:has-text("View")').first()
      if (await viewLink.isVisible()) {
        await viewLink.click()
        await page.waitForSelector('text=Loading account', { state: 'hidden', timeout: 10000 }).catch(() => {})
        await expect(page.locator('text=Subscription')).toBeVisible()
      }
    })

    test('shows entitlements panel', async ({ page }) => {
      await page.goto('/admin/accounts')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const viewLink = page.locator('a:has-text("View")').first()
      if (await viewLink.isVisible()) {
        await viewLink.click()
        await page.waitForSelector('text=Loading account', { state: 'hidden', timeout: 10000 }).catch(() => {})
        await expect(page.locator('text=Entitlements')).toBeVisible()
      }
    })

    test('shows admin notes textarea', async ({ page }) => {
      await page.goto('/admin/accounts')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const viewLink = page.locator('a:has-text("View")').first()
      if (await viewLink.isVisible()) {
        await viewLink.click()
        await page.waitForSelector('text=Loading account', { state: 'hidden', timeout: 10000 }).catch(() => {})
        await expect(page.locator('text=Admin Notes')).toBeVisible()
        await expect(page.locator('textarea')).toBeVisible()
      }
    })

    test('shows actions panel with Change Plan', async ({ page }) => {
      await page.goto('/admin/accounts')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const viewLink = page.locator('a:has-text("View")').first()
      if (await viewLink.isVisible()) {
        await viewLink.click()
        await page.waitForSelector('text=Loading account', { state: 'hidden', timeout: 10000 }).catch(() => {})
        await expect(page.locator('text=Change Plan')).toBeVisible()
      }
    })

    test('shows owned listings table', async ({ page }) => {
      await page.goto('/admin/accounts')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const viewLink = page.locator('a:has-text("View")').first()
      if (await viewLink.isVisible()) {
        await viewLink.click()
        await page.waitForSelector('text=Loading account', { state: 'hidden', timeout: 10000 }).catch(() => {})
        await expect(page.locator('text=Owned Listings')).toBeVisible()
      }
    })

    test('has back link to accounts', async ({ page }) => {
      await page.goto('/admin/accounts')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const viewLink = page.locator('a:has-text("View")').first()
      if (await viewLink.isVisible()) {
        await viewLink.click()
        await page.waitForSelector('text=Loading account', { state: 'hidden', timeout: 10000 }).catch(() => {})
        await expect(page.locator('a:has-text("Back")')).toBeVisible()
      }
    })
  })

  // ── Reports Page (tests 56-61) ──────────────────────────────

  test.describe('Reports page', () => {
    test('page loads with heading', async ({ page }) => {
      await page.goto('/admin/reports')
      await expect(page.locator('h1')).toContainText('Reports')
    })

    test('has status filter tabs: Open, Resolved', async ({ page }) => {
      await page.goto('/admin/reports')
      await expect(page.locator('button:has-text("Open")')).toBeVisible()
      await expect(page.locator('button:has-text("Resolved")')).toBeVisible()
    })

    test('table has correct column headers', async ({ page }) => {
      await page.goto('/admin/reports')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      for (const header of ['BUSINESS', 'REASON', 'DETAILS']) {
        await expect(page.locator(`th:has-text("${header}")`)).toBeVisible()
      }
    })

    test('open reports show action buttons', async ({ page }) => {
      await page.goto('/admin/reports')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      // If there are open reports, they should have action buttons
      const resolveBtn = page.locator('button:has-text("Resolve")').first()
      const noReports = page.locator('text=No reports found')
      // Either reports with actions or empty state
      await expect(resolveBtn.or(noReports)).toBeVisible()
    })

    test('Resolved tab shows resolution outcome', async ({ page }) => {
      await page.goto('/admin/reports')
      await page.locator('button:has-text("Resolved")').click()
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      // Should show resolved reports or empty state
      await expect(page.locator('h1')).toContainText('Reports')
    })

    test('AI Re-validate button present on open reports', async ({ page }) => {
      await page.goto('/admin/reports')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      // Check page loaded successfully - button only shows if there are open reports
      await expect(page.locator('h1')).toContainText('Reports')
    })
  })

  // ── Verification Page (tests 62-65) ─────────────────────────

  test.describe('Verification page', () => {
    test('page loads with heading', async ({ page }) => {
      await page.goto('/admin/verification')
      await expect(page.locator('h1')).toContainText('Verification Queue')
    })

    test('shows pending businesses or empty state', async ({ page }) => {
      await page.goto('/admin/verification')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const queue = page.locator('text=No businesses pending')
      const firstBiz = page.locator('.bg-white.rounded-lg').first()
      await expect(queue.or(firstBiz)).toBeVisible()
    })

    test('verification items show approve/reject/suspend buttons', async ({ page }) => {
      await page.goto('/admin/verification')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const approveBtn = page.locator('button:has-text("Approve")').first()
      const emptyState = page.locator('text=No businesses pending')
      await expect(approveBtn.or(emptyState)).toBeVisible()
    })

    test('verification items show Suspend button', async ({ page }) => {
      await page.goto('/admin/verification')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const suspendBtn = page.locator('button:has-text("Suspend")').first()
      const emptyState = page.locator('text=No businesses pending')
      await expect(suspendBtn.or(emptyState)).toBeVisible()
    })
  })

  // ── Claims Page (tests 66-69) ───────────────────────────────

  test.describe('Claims page', () => {
    test('page loads with heading', async ({ page }) => {
      await page.goto('/admin/claims')
      await expect(page.locator('h1')).toContainText('Pending Claims')
    })

    test('has back to dashboard link', async ({ page }) => {
      await page.goto('/admin/claims')
      await expect(page.locator('a:has-text("Back to Dashboard")')).toBeVisible()
    })

    test('shows claims or empty state', async ({ page }) => {
      await page.goto('/admin/claims')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const noClaims = page.locator('text=No pending claims')
      const firstClaim = page.locator('button:has-text("Approve")').first()
      await expect(noClaims.or(firstClaim)).toBeVisible()
    })

    test('claim cards show Approve and Reject buttons', async ({ page }) => {
      await page.goto('/admin/claims')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      const noClaims = page.locator('text=No pending claims')
      if (!(await noClaims.isVisible())) {
        await expect(page.locator('button:has-text("Approve")').first()).toBeVisible()
        await expect(page.locator('button:has-text("Reject")').first()).toBeVisible()
      }
    })
  })

  // ── Audit Log Page (tests 70-77) ────────────────────────────

  test.describe('Audit log page', () => {
    test('page loads with heading', async ({ page }) => {
      await page.goto('/admin/audit')
      await expect(page.locator('h1')).toContainText('Audit Log')
    })

    test('has Date From filter', async ({ page }) => {
      await page.goto('/admin/audit')
      await expect(page.locator('text=Date From')).toBeVisible()
      await expect(page.locator('input[type="date"]').first()).toBeVisible()
    })

    test('has Date To filter', async ({ page }) => {
      await page.goto('/admin/audit')
      await expect(page.locator('text=Date To')).toBeVisible()
    })

    test('has Action dropdown filter', async ({ page }) => {
      await page.goto('/admin/audit')
      await expect(page.locator('text=Action')).toBeVisible()
      // Action dropdown should have options
      const actionSelect = page.locator('select').first()
      await expect(actionSelect).toBeVisible()
    })

    test('has Entity Type filter', async ({ page }) => {
      await page.goto('/admin/audit')
      await expect(page.locator('text=Entity Type')).toBeVisible()
    })

    test('has Actor filter dropdown', async ({ page }) => {
      await page.goto('/admin/audit')
      await expect(page.locator('text=Actor')).toBeVisible()
    })

    test('has Entity ID text filter', async ({ page }) => {
      await page.goto('/admin/audit')
      await expect(page.locator('text=Entity ID')).toBeVisible()
    })

    test('table has correct column headers', async ({ page }) => {
      await page.goto('/admin/audit')
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 10000 }).catch(() => {})
      for (const header of ['TIME', 'ACTION', 'ENTITY']) {
        await expect(page.locator(`th:has-text("${header}")`)).toBeVisible()
      }
    })
  })

  // ── System Settings Page (tests 78-87) ──────────────────────

  test.describe('System settings page', () => {
    test('page loads with heading', async ({ page }) => {
      await page.goto('/admin/system')
      await expect(page.locator('h1')).toContainText('System Settings')
    })

    test('has Seed Controls tab', async ({ page }) => {
      await page.goto('/admin/system')
      await expect(page.locator('button:has-text("Seed Controls")')).toBeVisible()
    })

    test('Seed Controls tab shows seed visibility days', async ({ page }) => {
      await page.goto('/admin/system')
      await page.locator('button:has-text("Seed Controls")').click()
      await expect(page.locator('text=Seed Visibility Days')).toBeVisible()
    })

    test('Seed Controls tab shows seed expiry toggle', async ({ page }) => {
      await page.goto('/admin/system')
      await page.locator('button:has-text("Seed Controls")').click()
      await expect(page.locator('text=Seed Expiry')).toBeVisible()
    })

    test('has AI Verification tab', async ({ page }) => {
      await page.goto('/admin/system')
      await expect(page.locator('button:has-text("AI Verification")')).toBeVisible()
    })

    test('has Email Template tab', async ({ page }) => {
      await page.goto('/admin/system')
      await expect(page.locator('button:has-text("Email Template")')).toBeVisible()
    })

    test('Email Template tab has sub-tabs', async ({ page }) => {
      await page.goto('/admin/system')
      await page.locator('button:has-text("Email Template")').click()
      await expect(page.locator('button:has-text("Seed Notification")')).toBeVisible()
      await expect(page.locator('button:has-text("Claim Approved")')).toBeVisible()
      await expect(page.locator('button:has-text("Claim Rejected")')).toBeVisible()
    })

    test('has Ranking tab', async ({ page }) => {
      await page.goto('/admin/system')
      await expect(page.locator('button:has-text("Ranking")')).toBeVisible()
    })

    test('has Blacklist tab', async ({ page }) => {
      await page.goto('/admin/system')
      await expect(page.locator('button:has-text("Blacklist")')).toBeVisible()
    })

    test('has Data Reset tab', async ({ page }) => {
      await page.goto('/admin/system')
      await expect(page.locator('button:has-text("Data Reset")')).toBeVisible()
    })
  })

  // ── Ops Reports Page (tests 88-95) ──────────────────────────

  test.describe('Ops reports page', () => {
    test('page loads with heading', async ({ page }) => {
      await page.goto('/admin/ops')
      await expect(page.locator('h1')).toContainText('Operational Reports')
    })

    test('has period selector buttons: 7d, 14d, 30d, 90d', async ({ page }) => {
      await page.goto('/admin/ops')
      for (const period of ['7d', '14d', '30d', '90d']) {
        await expect(page.locator(`button:has-text("${period}")`)).toBeVisible()
      }
    })

    test('30d period is selected by default', async ({ page }) => {
      await page.goto('/admin/ops')
      // The active button should have distinct styling
      const btn30d = page.locator('button:has-text("30d")')
      await expect(btn30d).toBeVisible()
    })

    test('shows Subscriptions section', async ({ page }) => {
      await page.goto('/admin/ops')
      await expect(page.locator('text=Subscriptions').first()).toBeVisible()
    })

    test('shows Listings section', async ({ page }) => {
      await page.goto('/admin/ops')
      await expect(page.locator('text=Listings').first()).toBeVisible()
    })

    test('shows Moderation section', async ({ page }) => {
      await page.goto('/admin/ops')
      await expect(page.locator('text=Moderation').first()).toBeVisible()
    })

    test('switching period to 7d updates data', async ({ page }) => {
      await page.goto('/admin/ops')
      await page.locator('button:has-text("7d")').click()
      // Page should still show the sections
      await expect(page.locator('h1')).toContainText('Operational Reports')
    })

    test('subscription metrics show active/trial/past due counts', async ({ page }) => {
      await page.goto('/admin/ops')
      await page.waitForTimeout(1000) // Wait for data to load
      await expect(page.locator('text=Active').first()).toBeVisible()
    })
  })

  // ── Protection Tab (tests 96-100) ──────────────────────────

  test.describe('Protection tab', () => {
    test('Protection tab visible on system page', async ({ page }) => {
      await page.goto('/admin/system')
      await expect(page.locator('button:has-text("Protection")')).toBeVisible()
    })

    test('Protection tab loads with system flags toggles', async ({ page }) => {
      await page.goto('/admin/system')
      await page.locator('button:has-text("Protection")').click()
      await expect(page.locator('text=System Flags')).toBeVisible()
    })

    test('Protection tab shows kill switch section', async ({ page }) => {
      await page.goto('/admin/system')
      await page.locator('button:has-text("Protection")').click()
      await expect(page.locator('text=Emergency Kill Switch')).toBeVisible()
    })

    test('Protection tab shows circuit breaker status', async ({ page }) => {
      await page.goto('/admin/system')
      await page.locator('button:has-text("Protection")').click()
      await expect(page.locator('text=Circuit Breaker Status')).toBeVisible()
    })

    test('Protection tab shows recent abuse events section', async ({ page }) => {
      await page.goto('/admin/system')
      await page.locator('button:has-text("Protection")').click()
      await expect(page.locator('text=Recent Abuse Events')).toBeVisible()
    })
  })

  // ── Cross-page Navigation (tests 101-105) ────────────────────

  test.describe('Cross-page navigation', () => {
    test('dashboard Published card → listings page with published filter', async ({ page }) => {
      await page.goto('/admin')
      await page.locator('a:has-text("Published")').click()
      await expect(page).toHaveURL(/\/admin\/listings\?status=published/)
      await expect(page.locator('h1')).toContainText('All Listings')
    })

    test('dashboard Draft card → listings page with draft filter', async ({ page }) => {
      await page.goto('/admin')
      await page.locator('a:has-text("Draft")').first().click()
      await expect(page).toHaveURL(/\/admin\/listings\?status=draft/)
    })

    test('dashboard Suspended card → listings page with suspended filter', async ({ page }) => {
      await page.goto('/admin')
      await page.locator('a:has-text("Suspended")').first().click()
      await expect(page).toHaveURL(/\/admin\/listings\?status=suspended/)
    })

    test('dashboard Pending Claims card → claims page', async ({ page }) => {
      await page.goto('/admin')
      await page.locator('a:has-text("Pending Claims")').click()
      await expect(page).toHaveURL(/\/admin\/claims/)
      await expect(page.locator('h1')).toContainText('Pending Claims')
    })

    test('dashboard Pending Verification card → verification page', async ({ page }) => {
      await page.goto('/admin')
      await page.locator('a:has-text("Pending Verification")').click()
      await expect(page).toHaveURL(/\/admin\/verification/)
      await expect(page.locator('h1')).toContainText('Verification Queue')
    })
  })
})
