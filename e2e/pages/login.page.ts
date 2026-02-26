import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class LoginPage {
  constructor(private page: Page) {}

  get emailInput() { return this.page.getByTestId('login-email') }
  get passwordInput() { return this.page.getByTestId('login-password') }
  get submitButton() { return this.page.getByTestId('login-submit') }
  get errorMessage() { return this.page.getByTestId('login-error') }
  get passwordModeBtn() { return this.page.getByTestId('login-mode-password') }
  get magicLinkModeBtn() { return this.page.getByTestId('login-mode-magic') }
  get signupLink() { return this.page.getByTestId('login-signup-link') }

  async goto() {
    await this.page.goto('/login')
  }

  async loginWithPassword(email: string, password: string) {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
    await this.page.waitForURL(/\/dashboard/, { timeout: 15_000 })
  }

  async expectError() {
    await expect(this.errorMessage).toBeVisible()
  }
}
