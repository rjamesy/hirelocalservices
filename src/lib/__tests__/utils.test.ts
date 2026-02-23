import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  slugify,
  formatDistance,
  getAverageRating,
  truncate,
  formatPhone,
  cn,
  getBaseUrl,
} from '../utils'

// ─── slugify ────────────────────────────────────────────────────────

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('replaces spaces with hyphens', () => {
    expect(slugify('foo bar baz')).toBe('foo-bar-baz')
  })

  it('removes special characters', () => {
    expect(slugify('Hello! @World#')).toBe('hello-world')
  })

  it('collapses multiple hyphens into one', () => {
    expect(slugify('foo---bar')).toBe('foo-bar')
  })

  it('trims leading hyphens', () => {
    expect(slugify('---leading')).toBe('leading')
  })

  it('trims trailing hyphens', () => {
    expect(slugify('trailing---')).toBe('trailing')
  })

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('')
  })

  it('handles strings with only special characters', () => {
    expect(slugify('!@#$%')).toBe('')
  })

  it('handles accented and mixed characters', () => {
    expect(slugify('  Plumbing & Gas Services  ')).toBe('plumbing-gas-services')
  })
})

// ─── formatDistance ─────────────────────────────────────────────────

describe('formatDistance', () => {
  it('formats distance under 1 km in meters', () => {
    expect(formatDistance(500)).toBe('500 m')
  })

  it('rounds meters for distances under 1 km', () => {
    expect(formatDistance(999.7)).toBe('1000 m')
  })

  it('returns meters at 999 m boundary', () => {
    expect(formatDistance(999)).toBe('999 m')
  })

  it('formats exactly 1000 m as 1.0 km', () => {
    expect(formatDistance(1000)).toBe('1.0 km')
  })

  it('formats large distances in km with one decimal', () => {
    expect(formatDistance(15750)).toBe('15.8 km')
  })

  it('formats zero distance', () => {
    expect(formatDistance(0)).toBe('0 m')
  })

  it('formats exactly at the boundary', () => {
    expect(formatDistance(999.99)).toBe('1000 m')
  })
})

// ─── getAverageRating ───────────────────────────────────────────────

describe('getAverageRating', () => {
  it('returns 0 for empty array', () => {
    expect(getAverageRating([])).toBe(0)
  })

  it('returns the rating for a single item', () => {
    expect(getAverageRating([{ rating: 4 }])).toBe(4)
  })

  it('calculates average of multiple ratings', () => {
    expect(getAverageRating([{ rating: 3 }, { rating: 5 }])).toBe(4)
  })

  it('rounds to 1 decimal place', () => {
    expect(getAverageRating([{ rating: 3 }, { rating: 4 }, { rating: 5 }])).toBe(4)
  })

  it('handles non-integer averages', () => {
    expect(getAverageRating([{ rating: 1 }, { rating: 2 }])).toBe(1.5)
  })

  it('handles all fives', () => {
    expect(getAverageRating([{ rating: 5 }, { rating: 5 }, { rating: 5 }])).toBe(5)
  })
})

// ─── truncate ───────────────────────────────────────────────────────

describe('truncate', () => {
  it('returns unchanged string when shorter than limit', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('returns unchanged string at exact length', () => {
    expect(truncate('hello', 5)).toBe('hello')
  })

  it('truncates and adds ellipsis when longer', () => {
    expect(truncate('hello world', 5)).toBe('hello...')
  })

  it('trims trailing whitespace before adding ellipsis', () => {
    expect(truncate('hello world', 6)).toBe('hello...')
  })

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('')
  })
})

// ─── formatPhone ────────────────────────────────────────────────────

describe('formatPhone', () => {
  it('formats mobile number 04XX XXX XXX', () => {
    expect(formatPhone('0412345678')).toBe('0412 345 678')
  })

  it('formats landline number (0X) XXXX XXXX', () => {
    expect(formatPhone('0212345678')).toBe('(02) 1234 5678')
  })

  it('handles +61 prefix for mobile', () => {
    expect(formatPhone('+61412345678')).toBe('0412 345 678')
  })

  it('handles 61 prefix without plus', () => {
    expect(formatPhone('61412345678')).toBe('0412 345 678')
  })

  it('strips non-digit characters', () => {
    expect(formatPhone('04 1234 5678')).toBe('0412 345 678')
  })

  it('returns fallback for short numbers', () => {
    expect(formatPhone('12345')).toBe('12345')
  })

  it('returns original for unrecognized format', () => {
    expect(formatPhone('abc')).toBe('abc')
  })
})

// ─── cn ─────────────────────────────────────────────────────────────

describe('cn', () => {
  it('joins class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('filters out undefined', () => {
    expect(cn('foo', undefined, 'bar')).toBe('foo bar')
  })

  it('filters out false', () => {
    expect(cn('foo', false, 'bar')).toBe('foo bar')
  })

  it('filters out null', () => {
    expect(cn('foo', null, 'bar')).toBe('foo bar')
  })

  it('returns empty string for no args', () => {
    expect(cn()).toBe('')
  })

  it('returns empty string for all falsy', () => {
    expect(cn(undefined, false, null)).toBe('')
  })
})

// ─── getBaseUrl ─────────────────────────────────────────────────────

describe('getBaseUrl', () => {
  const originalEnv = process.env.NEXT_PUBLIC_APP_URL

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_APP_URL = originalEnv
    } else {
      delete process.env.NEXT_PUBLIC_APP_URL
    }
  })

  it('returns env var when set', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://hirelocalservices.com.au'
    expect(getBaseUrl()).toBe('https://hirelocalservices.com.au')
  })

  it('returns localhost when env is not set', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(getBaseUrl()).toBe('http://localhost:3000')
  })
})
