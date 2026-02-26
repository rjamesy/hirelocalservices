import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class DashboardPage {
  constructor(private page: Page) {}

  get heading() { return this.page.getByTestId('dashboard-heading') }
  get statusCard() { return this.page.getByTestId('dashboard-status-card') }
  get createCta() { return this.page.getByTestId('dashboard-create-cta') }
  get createLink() { return this.page.getByTestId('dashboard-create-link') }
  get editLink() { return this.page.getByTestId('dashboard-edit-link') }
  get photosLink() { return this.page.getByTestId('dashboard-photos-link') }

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
    await expect(this.statusCard).toBeVisible()
  }

  async clickCreateListing() {
    await this.createLink.click()
  }

  async clickEditListing() {
    await this.editLink.click()
  }
}
