import { describe, it, expect } from 'vitest'
import {
  businessSchema,
  locationSchema,
  testimonialSchema,
  searchSchema,
  reportSchema,
} from '../validations'

// ─── businessSchema ─────────────────────────────────────────────────

describe('businessSchema', () => {
  const validBusiness = {
    name: 'Test Plumbing Co',
    description: 'We provide excellent plumbing services across Brisbane.',
  }

  it('accepts valid business data', () => {
    const result = businessSchema.safeParse(validBusiness)
    expect(result.success).toBe(true)
  })

  it('rejects name shorter than 2 characters', () => {
    const result = businessSchema.safeParse({ ...validBusiness, name: 'A' })
    expect(result.success).toBe(false)
  })

  it('rejects name longer than 80 characters', () => {
    const result = businessSchema.safeParse({ ...validBusiness, name: 'A'.repeat(81) })
    expect(result.success).toBe(false)
  })

  it('accepts valid AU phone', () => {
    const result = businessSchema.safeParse({ ...validBusiness, phone: '0412345678' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid phone', () => {
    const result = businessSchema.safeParse({ ...validBusiness, phone: '12345' })
    expect(result.success).toBe(false)
  })

  it('accepts empty string phone (optional)', () => {
    const result = businessSchema.safeParse({ ...validBusiness, phone: '' })
    expect(result.success).toBe(true)
  })

  it('accepts optional phone being undefined', () => {
    const result = businessSchema.safeParse({ ...validBusiness })
    expect(result.success).toBe(true)
  })

  it('accepts valid website URL', () => {
    const result = businessSchema.safeParse({ ...validBusiness, website: 'https://example.com' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid website URL', () => {
    const result = businessSchema.safeParse({ ...validBusiness, website: 'not-a-url' })
    expect(result.success).toBe(false)
  })

  it('accepts empty string website', () => {
    const result = businessSchema.safeParse({ ...validBusiness, website: '' })
    expect(result.success).toBe(true)
  })

  it('accepts valid email', () => {
    const result = businessSchema.safeParse({ ...validBusiness, email_contact: 'test@test.com' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid email', () => {
    const result = businessSchema.safeParse({ ...validBusiness, email_contact: 'not-an-email' })
    expect(result.success).toBe(false)
  })

  it('accepts empty string email', () => {
    const result = businessSchema.safeParse({ ...validBusiness, email_contact: '' })
    expect(result.success).toBe(true)
  })

  it('rejects description shorter than 10 characters', () => {
    const result = businessSchema.safeParse({ ...validBusiness, description: 'Short' })
    expect(result.success).toBe(false)
  })

  it('rejects description longer than 2500 characters', () => {
    const result = businessSchema.safeParse({ ...validBusiness, description: 'A'.repeat(2501) })
    expect(result.success).toBe(false)
  })

  it('rejects description with excessive URLs (spam)', () => {
    const spamDescription = 'Check out https://a.com and https://b.com and https://c.com and https://d.com links'
    const result = businessSchema.safeParse({ ...validBusiness, description: spamDescription })
    expect(result.success).toBe(false)
  })

  it('rejects description with spam words', () => {
    const result = businessSchema.safeParse({
      ...validBusiness,
      description: 'Buy now and get free money with our special offer!',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid ABN (11 digits)', () => {
    const result = businessSchema.safeParse({ ...validBusiness, abn: '12345678901' })
    expect(result.success).toBe(true)
  })

  it('rejects ABN that is not 11 digits', () => {
    const result = businessSchema.safeParse({ ...validBusiness, abn: '1234' })
    expect(result.success).toBe(false)
  })

  it('accepts empty string ABN', () => {
    const result = businessSchema.safeParse({ ...validBusiness, abn: '' })
    expect(result.success).toBe(true)
  })
})

// ─── locationSchema ─────────────────────────────────────────────────

describe('locationSchema', () => {
  const validLocation = {
    suburb: 'Brisbane',
    state: 'QLD' as const,
    postcode: '4000',
    service_radius_km: 25,
  }

  it('accepts valid location data', () => {
    const result = locationSchema.safeParse(validLocation)
    expect(result.success).toBe(true)
  })

  it('requires suburb', () => {
    const result = locationSchema.safeParse({ ...validLocation, suburb: '' })
    expect(result.success).toBe(false)
  })

  it('rejects suburb longer than 100 chars', () => {
    const result = locationSchema.safeParse({ ...validLocation, suburb: 'A'.repeat(101) })
    expect(result.success).toBe(false)
  })

  it.each(['QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'NT', 'ACT'] as const)(
    'accepts valid AU state: %s',
    (state) => {
      const result = locationSchema.safeParse({ ...validLocation, state })
      expect(result.success).toBe(true)
    }
  )

  it('rejects invalid state', () => {
    const result = locationSchema.safeParse({ ...validLocation, state: 'XX' })
    expect(result.success).toBe(false)
  })

  it('requires 4-digit postcode', () => {
    const result = locationSchema.safeParse({ ...validLocation, postcode: '123' })
    expect(result.success).toBe(false)
  })

  it('rejects non-numeric postcode', () => {
    const result = locationSchema.safeParse({ ...validLocation, postcode: 'abcd' })
    expect(result.success).toBe(false)
  })

  it.each([5, 10, 25, 50])('accepts valid radius: %d km', (radius) => {
    const result = locationSchema.safeParse({ ...validLocation, service_radius_km: radius })
    expect(result.success).toBe(true)
  })

  it('rejects invalid radius', () => {
    const result = locationSchema.safeParse({ ...validLocation, service_radius_km: 15 })
    expect(result.success).toBe(false)
  })

  it('defaults radius to 25 when not provided', () => {
    const { service_radius_km, ...rest } = validLocation
    const result = locationSchema.safeParse(rest)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.service_radius_km).toBe(25)
    }
  })
})

// ─── testimonialSchema ──────────────────────────────────────────────

describe('testimonialSchema', () => {
  const validTestimonial = {
    author_name: 'John Smith',
    text: 'Excellent service from start to finish.',
    rating: 5,
  }

  it('accepts valid testimonial', () => {
    const result = testimonialSchema.safeParse(validTestimonial)
    expect(result.success).toBe(true)
  })

  it('rejects author name shorter than 2 chars', () => {
    const result = testimonialSchema.safeParse({ ...validTestimonial, author_name: 'J' })
    expect(result.success).toBe(false)
  })

  it('rejects author name longer than 100 chars', () => {
    const result = testimonialSchema.safeParse({ ...validTestimonial, author_name: 'A'.repeat(101) })
    expect(result.success).toBe(false)
  })

  it('rejects text shorter than 10 chars', () => {
    const result = testimonialSchema.safeParse({ ...validTestimonial, text: 'Short' })
    expect(result.success).toBe(false)
  })

  it('rejects text longer than 500 chars', () => {
    const result = testimonialSchema.safeParse({ ...validTestimonial, text: 'A'.repeat(501) })
    expect(result.success).toBe(false)
  })

  it('rejects text with spam words', () => {
    const result = testimonialSchema.safeParse({
      ...validTestimonial,
      text: 'Click here for free money and casino rewards!',
    })
    expect(result.success).toBe(false)
  })

  it('rejects text with excessive URLs', () => {
    const result = testimonialSchema.safeParse({
      ...validTestimonial,
      text: 'Visit https://a.com https://b.com https://c.com https://d.com for deals',
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-integer rating', () => {
    const result = testimonialSchema.safeParse({ ...validTestimonial, rating: 3.5 })
    expect(result.success).toBe(false)
  })

  it('rejects rating less than 1', () => {
    const result = testimonialSchema.safeParse({ ...validTestimonial, rating: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects rating greater than 5', () => {
    const result = testimonialSchema.safeParse({ ...validTestimonial, rating: 6 })
    expect(result.success).toBe(false)
  })

  it.each([1, 2, 3, 4, 5])('accepts integer rating: %d', (rating) => {
    const result = testimonialSchema.safeParse({ ...validTestimonial, rating })
    expect(result.success).toBe(true)
  })
})

// ─── searchSchema ───────────────────────────────────────────────────

describe('searchSchema', () => {
  it('accepts empty object (all optional)', () => {
    const result = searchSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts valid 4-digit postcode', () => {
    const result = searchSchema.safeParse({ postcode: '4000' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid postcode format', () => {
    const result = searchSchema.safeParse({ postcode: '40' })
    expect(result.success).toBe(false)
  })

  it('accepts empty string postcode', () => {
    const result = searchSchema.safeParse({ postcode: '' })
    expect(result.success).toBe(true)
  })

  it.each([5, 10, 25, 50])('accepts valid radius: %d', (radius_km) => {
    const result = searchSchema.safeParse({ radius_km })
    expect(result.success).toBe(true)
  })

  it('rejects invalid radius value', () => {
    const result = searchSchema.safeParse({ radius_km: 100 })
    expect(result.success).toBe(false)
  })

  it('rejects keyword longer than 100 chars', () => {
    const result = searchSchema.safeParse({ keyword: 'A'.repeat(101) })
    expect(result.success).toBe(false)
  })

  it('accepts keyword up to 100 chars', () => {
    const result = searchSchema.safeParse({ keyword: 'A'.repeat(100) })
    expect(result.success).toBe(true)
  })

  it('rejects page less than 1', () => {
    const result = searchSchema.safeParse({ page: 0 })
    expect(result.success).toBe(false)
  })

  it('accepts page >= 1', () => {
    const result = searchSchema.safeParse({ page: 1 })
    expect(result.success).toBe(true)
  })

  it('defaults radius to 25', () => {
    const result = searchSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.radius_km).toBe(25)
    }
  })
})

// ─── reportSchema ───────────────────────────────────────────────────

describe('reportSchema', () => {
  it.each(['spam', 'inappropriate', 'fake', 'other'] as const)(
    'accepts valid reason: %s',
    (reason) => {
      const result = reportSchema.safeParse({ reason })
      expect(result.success).toBe(true)
    }
  )

  it('rejects invalid reason', () => {
    const result = reportSchema.safeParse({ reason: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('accepts optional details', () => {
    const result = reportSchema.safeParse({ reason: 'spam', details: 'This is spam' })
    expect(result.success).toBe(true)
  })

  it('accepts empty string details', () => {
    const result = reportSchema.safeParse({ reason: 'spam', details: '' })
    expect(result.success).toBe(true)
  })

  it('rejects details longer than 500 chars', () => {
    const result = reportSchema.safeParse({ reason: 'spam', details: 'A'.repeat(501) })
    expect(result.success).toBe(false)
  })

  it('accepts details at 500 chars', () => {
    const result = reportSchema.safeParse({ reason: 'spam', details: 'A'.repeat(500) })
    expect(result.success).toBe(true)
  })
})
