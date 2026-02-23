/**
 * tests/admin-email-template.test.ts
 *
 * Tests for admin email template system:
 * - Template validation (both placeholders required, missing one, empty)
 * - Template rendering (placeholder replacement, multiple occurrences)
 */

import { describe, it, expect } from 'vitest'

// ─── Template Validation ─────────────────────────────────────────────

function validateEmailTemplate(body: string): { valid: boolean; error?: string } {
  if (!body || body.trim().length === 0) {
    return { valid: false, error: 'Email body cannot be empty' }
  }
  if (!body.includes('{view_url}')) {
    return { valid: false, error: 'Email body must contain {view_url} placeholder' }
  }
  if (!body.includes('{unlist_url}')) {
    return { valid: false, error: 'Email body must contain {unlist_url} placeholder' }
  }
  return { valid: true }
}

// ─── Template Rendering ──────────────────────────────────────────────

function renderEmailTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{${key}}`, value)
  }
  return result
}

describe('Admin Email Template', () => {
  // ─── Template Validation ────────────────────────────────────────

  describe('Template validation', () => {
    it('should accept template with both placeholders', () => {
      const body = 'View: {view_url}, Unlist: {unlist_url}'
      const result = validateEmailTemplate(body)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject template missing {view_url}', () => {
      const body = 'Unlist: {unlist_url}'
      const result = validateEmailTemplate(body)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('view_url')
    })

    it('should reject template missing {unlist_url}', () => {
      const body = 'View: {view_url}'
      const result = validateEmailTemplate(body)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('unlist_url')
    })

    it('should reject empty template', () => {
      const result = validateEmailTemplate('')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('empty')
    })

    it('should reject whitespace-only template', () => {
      const result = validateEmailTemplate('   ')
      expect(result.valid).toBe(false)
    })

    it('should reject template with no placeholders', () => {
      const body = 'Hello, your business has been listed.'
      const result = validateEmailTemplate(body)
      expect(result.valid).toBe(false)
    })

    it('should accept template with placeholders anywhere in text', () => {
      const body = `
        Hi there,

        Your listing is at {view_url}

        To unlist, go to {unlist_url}

        Thanks!
      `
      const result = validateEmailTemplate(body)
      expect(result.valid).toBe(true)
    })
  })

  // ─── Template Rendering ─────────────────────────────────────────

  describe('Template rendering', () => {
    it('should replace {view_url} with actual URL', () => {
      const template = 'View your listing: {view_url}'
      const result = renderEmailTemplate(template, {
        view_url: 'https://hirelocalservices.com.au/business/test-slug',
      })
      expect(result).toBe('View your listing: https://hirelocalservices.com.au/business/test-slug')
    })

    it('should replace {unlist_url} with actual URL', () => {
      const template = 'Unlist: {unlist_url}'
      const result = renderEmailTemplate(template, {
        unlist_url: 'https://hirelocalservices.com.au/unlist/abc123',
      })
      expect(result).toBe('Unlist: https://hirelocalservices.com.au/unlist/abc123')
    })

    it('should replace both placeholders', () => {
      const template = 'View: {view_url} | Unlist: {unlist_url}'
      const result = renderEmailTemplate(template, {
        view_url: 'https://example.com/view',
        unlist_url: 'https://example.com/unlist',
      })
      expect(result).toBe('View: https://example.com/view | Unlist: https://example.com/unlist')
    })

    it('should handle multiple occurrences of same placeholder', () => {
      const template = '{view_url} is your listing. Bookmark {view_url}'
      const result = renderEmailTemplate(template, {
        view_url: 'https://example.com/view',
      })
      expect(result).toBe('https://example.com/view is your listing. Bookmark https://example.com/view')
    })

    it('should leave unknown placeholders as-is', () => {
      const template = '{view_url} and {unknown_var}'
      const result = renderEmailTemplate(template, {
        view_url: 'https://example.com',
      })
      expect(result).toContain('{unknown_var}')
    })

    it('should handle empty variables', () => {
      const template = 'View: {view_url}'
      const result = renderEmailTemplate(template, { view_url: '' })
      expect(result).toBe('View: ')
    })

    it('should handle complex multiline template', () => {
      const template = `Hi,

Your business has been listed on HireLocalServices.com.au.

View your listing: {view_url}

If you did not request this listing, you can unlist it here: {unlist_url}

Regards,
HireLocalServices Team`

      const result = renderEmailTemplate(template, {
        view_url: 'https://hirelocalservices.com.au/business/acme-plumbing',
        unlist_url: 'https://hirelocalservices.com.au/unlist/token-abc',
      })

      expect(result).toContain('acme-plumbing')
      expect(result).toContain('token-abc')
      expect(result).not.toContain('{view_url}')
      expect(result).not.toContain('{unlist_url}')
    })
  })
})
