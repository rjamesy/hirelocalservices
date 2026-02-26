import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class BillingPage {
  constructor(private page: Page) {}

  get heading() { return this.page.getByTestId('billing-heading') }
  get currentPlan() { return this.page.getByTestId('billing-current-plan') }
  get statusBadge() { return this.page.getByTestId('billing-status-badge') }
  get manageButton() { return this.page.getByTestId('billing-manage-btn') }
  get faq() { return this.page.getByTestId('billing-faq') }

  async goto() {
    await this.page.goto('/dashboard/billing')
  }

  async expectLoaded() {
    // Billing page shows either "Billing" heading (active sub) or "Choose a Plan" (no sub)
    await expect(
      this.heading.or(this.page.getByText('Choose a Plan'))
    ).toBeVisible()
  }

  async expectManageButtonVisible() {
    await expect(this.manageButton).toBeVisible()
  }

  async expectCurrentPlan(name: string) {
    await expect(this.currentPlan).toContainText(name)
  }
}
