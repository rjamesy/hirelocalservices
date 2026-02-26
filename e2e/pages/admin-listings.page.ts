import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class AdminVerificationPage {
  constructor(private page: Page) {}

  get approveButton() { return this.page.getByTestId('admin-approve-btn').first() }
  get rejectButton() { return this.page.getByTestId('admin-reject-btn').first() }
  get notesTextarea() { return this.page.getByTestId('admin-verification-notes').first() }

  async goto() {
    await this.page.goto('/admin/verification')
  }

  async approveFirst(notes?: string) {
    if (notes) await this.notesTextarea.fill(notes)
    await this.approveButton.click()
  }

  async rejectFirst(notes?: string) {
    if (notes) await this.notesTextarea.fill(notes)
    await this.rejectButton.click()
  }

  async getQueueCount() {
    return this.page.getByTestId('admin-approve-btn').count()
  }
}
