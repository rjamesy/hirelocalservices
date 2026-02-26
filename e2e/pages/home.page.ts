import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class HomePage {
  constructor(private page: Page) {}

  // Locators
  get heroSection() { return this.page.getByTestId('hero-section') }
  get heroHeading() { return this.page.getByTestId('hero-heading') }
  get categoriesSection() { return this.page.getByTestId('categories-section') }
  get howItWorksSection() { return this.page.getByTestId('how-it-works-section') }
  get ctaSection() { return this.page.getByTestId('cta-section') }
  get getStartedLink() { return this.page.getByTestId('cta-get-started-link') }

  async goto() {
    await this.page.goto('/')
  }

  async expectLoaded() {
    await expect(this.heroSection).toBeVisible()
    await expect(this.heroHeading).toBeVisible()
  }

  async clickGetStarted() {
    await this.getStartedLink.click()
  }
}
