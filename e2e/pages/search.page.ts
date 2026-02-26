import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class SearchPage {
  constructor(private page: Page) {}

  get results() { return this.page.getByTestId('search-results') }
  get empty() { return this.page.getByTestId('search-empty') }
  get guidance() { return this.page.getByTestId('search-guidance') }

  async goto(params?: string) {
    await this.page.goto(params ? `/search?${params}` : '/search')
  }

  async expectResults() {
    await expect(this.results).toBeVisible()
  }

  async expectEmpty() {
    await expect(this.empty).toBeVisible()
  }

  async expectGuidance() {
    await expect(this.guidance).toBeVisible()
  }

  async expectResultsOrEmpty() {
    await expect(this.results.or(this.empty)).toBeVisible()
  }

  async getResultCount() {
    return this.results.locator('[data-testid="business-card"]').count()
  }

  async clickFirstResult() {
    await this.results.locator('a[href^="/business/"]').first().click()
  }
}
