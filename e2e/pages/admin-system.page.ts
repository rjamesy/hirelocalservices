import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class AdminSystemPage {
  constructor(private page: Page) {}

  get killSwitchSection() { return this.page.getByTestId('admin-kill-switch') }
  get circuitBreakerSection() { return this.page.getByTestId('admin-circuit-breaker') }

  async goto() {
    await this.page.goto('/admin/system')
  }

  async clickProtectionTab() {
    await this.page.getByTestId('admin-tab-protection').click()
  }

  async toggleFlag(flagName: string, enable: boolean) {
    const label = this.page.getByTestId(`admin-flag-toggle-${flagName}`)
    const checkbox = label.locator('input[type="checkbox"]')
    if (enable) {
      await checkbox.check()
    } else {
      await checkbox.uncheck()
    }
    // Wait for save
    await this.page.waitForTimeout(1000)
  }

  async isFlagEnabled(flagName: string): Promise<boolean> {
    const label = this.page.getByTestId(`admin-flag-toggle-${flagName}`)
    return label.locator('input[type="checkbox"]').isChecked()
  }
}
