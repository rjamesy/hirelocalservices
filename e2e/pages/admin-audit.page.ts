import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class AdminAuditPage {
  constructor(private page: Page) {}

  get auditTable() { return this.page.getByTestId('admin-audit-table') }
  get auditRows() { return this.page.getByTestId('admin-audit-row') }

  async goto() {
    await this.page.goto('/admin/audit')
  }

  async expectLoaded() {
    await expect(this.auditTable).toBeVisible()
  }

  async expectRecentEntry(action: string) {
    const row = this.auditRows.first()
    await expect(row).toContainText(action)
  }

  async getRowCount() {
    return this.auditRows.count()
  }
}
