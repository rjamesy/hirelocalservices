import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class ListingPage {
  constructor(private page: Page) {}

  get heading() { return this.page.getByTestId('listing-heading') }
  get nameInput() { return this.page.getByTestId('listing-name') }
  get descriptionInput() { return this.page.getByTestId('listing-description') }
  get phoneInput() { return this.page.getByTestId('listing-phone') }
  get emailInput() { return this.page.getByTestId('listing-email') }
  get websiteInput() { return this.page.getByTestId('listing-website') }
  get nextButton() { return this.page.getByTestId('listing-next') }
  get backButton() { return this.page.getByTestId('listing-back') }
  get publishButton() { return this.page.getByTestId('listing-publish') }
  get toast() { return this.page.getByTestId('listing-toast') }

  async fillStep1(data: { name: string; description: string; phone?: string; email?: string }) {
    await this.nameInput.fill(data.name)
    await this.descriptionInput.fill(data.description)
    if (data.phone) await this.phoneInput.fill(data.phone)
    if (data.email) await this.emailInput.fill(data.email)
  }

  async saveAndContinue() {
    await this.nextButton.click()
  }

  async selectCategories() {
    // Select first available checkbox
    const checkbox = this.page.locator('input[type="checkbox"]').first()
    await checkbox.check()
  }

  async fillLocation(suburb: string, state: string, postcode: string) {
    await this.page.locator('#suburb').fill(suburb)
    await this.page.locator('#state').selectOption(state)
    await this.page.locator('#postcode').fill(postcode)
  }

  async clickPublish() {
    await this.publishButton.click()
  }
}
