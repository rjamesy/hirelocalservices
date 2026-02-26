import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class DashboardPage {
  constructor(private page: Page) {}

  get heading() { return this.page.getByTestId('dashboard-heading') }
  get accountSummary() { return this.page.getByTestId('dashboard-account-summary') }
  get planBadge() { return this.page.getByTestId('dashboard-plan-badge') }
  get listingsUsed() { return this.page.getByTestId('dashboard-listings-used') }
  get primaryCta() { return this.page.getByTestId('dashboard-primary-cta') }
  get createCta() { return this.page.getByTestId('dashboard-create-cta') }
  get createLink() { return this.page.getByTestId('dashboard-create-link') }
  get editLink() { return this.page.getByTestId('dashboard-edit-link') }

  async goto() {
    await this.page.goto('/dashboard')
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }

  async expectNoBusiness() {
    await expect(this.createCta).toBeVisible()
  }

  async expectHasBusiness() {
    await expect(this.accountSummary).toBeVisible()
  }

  async clickCreateListing() {
    await this.createLink.click()
  }

  async clickEditListing() {
    await this.editLink.click()
  }
}
