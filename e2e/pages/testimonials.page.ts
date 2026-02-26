import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export class TestimonialsPage {
  constructor(private page: Page) {}

  get heading() { return this.page.getByTestId('testimonials-heading') }
  get testimonialCount() { return this.page.getByTestId('testimonials-count') }
  get premiumGate() { return this.page.getByTestId('testimonials-premium-gate') }

  async goto() {
    await this.page.goto('/dashboard/testimonials')
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible()
  }

  async addTestimonial(authorName: string, text: string, rating: number) {
    // Fill the testimonial form (TestimonialForm component)
    await this.page.locator('input[placeholder*="name"], input[name="author_name"]').first().fill(authorName)
    await this.page.locator('textarea[placeholder*="testimonial"], textarea[name="text"]').first().fill(text)
    // Click star rating
    const stars = this.page.locator('[role="radio"], button[aria-label*="star"]')
    if (await stars.count() > 0) {
      await stars.nth(rating - 1).click()
    }
    await this.page.locator('button:has-text("Add"), button[type="submit"]').first().click()
  }

  async getTestimonialCount(): Promise<string> {
    return (await this.testimonialCount.textContent()) ?? ''
  }

  async deleteTestimonial(index: number) {
    this.page.once('dialog', dialog => dialog.accept())
    const deleteButtons = this.page.locator('button[title="Delete testimonial"]')
    await deleteButtons.nth(index).click()
  }
}
