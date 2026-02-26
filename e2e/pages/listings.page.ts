import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class ListingsPage {
  constructor(private page: Page) {}

  get heading() { return this.page.getByTestId('listings-heading') }
  get createBtn() { return this.page.getByTestId('listings-create-btn') }

  filterTab(tab: string) { return this.page.getByTestId(`listings-filter-${tab}`) }
  listingRow(id: string) { return this.page.getByTestId(`listings-row-${id}`) }
  editBtn(id: string) { return this.page.getByTestId(`listings-edit-${id}`) }
  pauseBtn(id: string) { return this.page.getByTestId(`listings-pause-${id}`) }
  deleteBtn(id: string) { return this.page.getByTestId(`listings-delete-${id}`) }

  async goto() {
    await this.page.goto('/dashboard/listing')
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }

  async expectHasFilters() {
    await expect(this.filterTab('all')).toBeVisible()
    await expect(this.filterTab('action_needed')).toBeVisible()
    await expect(this.filterTab('complete')).toBeVisible()
  }
}
