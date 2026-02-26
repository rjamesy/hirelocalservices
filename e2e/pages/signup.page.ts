import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class SignupPage {
  constructor(private page: Page) {}

  get emailInput() { return this.page.getByTestId('signup-email') }
  get passwordInput() { return this.page.getByTestId('signup-password') }
  get submitButton() { return this.page.getByTestId('signup-submit') }
  get errorMessage() { return this.page.getByTestId('signup-error') }
  get successMessage() { return this.page.getByTestId('signup-success') }
  get loginLink() { return this.page.getByTestId('signup-login-link') }

  async goto() {
    await this.page.goto('/signup')
  }

  async fillForm(email: string, password: string) {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
  }

  async submit() {
    await this.submitButton.click()
  }

  async expectSuccess() {
    await expect(this.successMessage).toBeVisible({ timeout: 15_000 })
  }

  async expectError() {
    await expect(this.errorMessage).toBeVisible()
  }
}
