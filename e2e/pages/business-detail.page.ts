import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class BusinessDetailPage {
  constructor(private page: Page) {}

  get businessName() { return this.page.getByTestId('business-name') }
  get description() { return this.page.getByTestId('business-description') }
  get contact() { return this.page.getByTestId('business-contact') }
  get phone() { return this.page.getByTestId('business-phone') }
  get emailLink() { return this.page.getByTestId('business-email-link') }
  get websiteLink() { return this.page.getByTestId('business-website-link') }
  get claimButton() { return this.page.getByTestId('business-claim-btn') }
  get verificationBadge() { return this.page.getByTestId('business-verification-badge') }

  async goto(slug: string) {
    await this.page.goto(`/business/${slug}`)
  }

  async expectLoaded() {
    await expect(this.businessName).toBeVisible()
  }

  async expectName(name: string) {
    await expect(this.businessName).toContainText(name)
  }

  async expectClaimButton() {
    await expect(this.claimButton).toBeVisible()
  }
}
