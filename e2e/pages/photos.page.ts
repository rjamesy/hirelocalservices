import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class PhotosPage {
  constructor(private page: Page) {}

  get heading() { return this.page.getByTestId('photos-heading') }
  get photoCount() { return this.page.getByTestId('photos-count') }
  get premiumGate() { return this.page.getByTestId('photos-premium-gate') }

  async goto() {
    await this.page.goto('/dashboard/photos')
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }

  async getPhotoCount(): Promise<string> {
    return (await this.photoCount.textContent()) ?? ''
  }

  async uploadPhoto(filePath: string) {
    const fileInput = this.page.locator('input[type="file"]')
    await fileInput.setInputFiles(filePath)
  }

  async deletePhoto(index: number) {
    const deleteButtons = this.page.locator('button[title="Delete photo"], button[title="Delete"]')
    await deleteButtons.nth(index).click()
    // Handle confirm dialog
    this.page.once('dialog', dialog => dialog.accept())
  }
}
