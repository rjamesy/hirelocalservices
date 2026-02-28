/**
 * Image Moderation Tests
 *
 * Tests the moderateImages function from verification.ts
 * - Returns empty array for empty input
 * - Returns verification_unavailable when no API key
 * - Handles API success responses (safe + unsafe)
 * - Graceful degradation on API errors and timeouts
 * - Sanity check overrides relevance-based rejections
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const originalEnv = { ...process.env }

// Helper: mock fetch to handle image download (first call) + OpenAI (second call)
function mockFetchForModeration(openAiResponse: object | Error, dlOk = true) {
  let callCount = 0
  return vi.fn().mockImplementation(() => {
    callCount++
    if (callCount % 2 === 1) {
      // Odd calls = image download
      if (!dlOk) return Promise.resolve({ ok: false, status: 404 })
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: new Map([['content-type', 'image/jpeg']]) as any,
      })
    }
    // Even calls = OpenAI API
    if (openAiResponse instanceof Error) return Promise.reject(openAiResponse)
    return Promise.resolve(openAiResponse)
  })
}

describe('moderateImages', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('returns empty array for empty input', async () => {
    const { moderateImages } = await import('@/lib/verification')
    const results = await moderateImages([])
    expect(results).toEqual([])
  })

  it('returns verification_unavailable when no API key', async () => {
    delete process.env.OPENAI_API_KEY
    const { moderateImages } = await import('@/lib/verification')
    const results = await moderateImages([
      'https://example.com/photo1.jpg',
      'https://example.com/photo2.jpg',
    ])
    expect(results).toHaveLength(2)
    expect(results[0].safe).toBe(false)
    expect(results[0].error_type).toBe('verification_unavailable')
    expect(results[1].safe).toBe(false)
    expect(results[1].error_type).toBe('verification_unavailable')
  })

  it('returns verification_unavailable on image download failure', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    global.fetch = mockFetchForModeration({}, false)

    const { moderateImages } = await import('@/lib/verification')
    const results = await moderateImages(['https://example.com/photo.jpg'])
    expect(results).toHaveLength(1)
    expect(results[0].safe).toBe(false)
    expect(results[0].error_type).toBe('verification_unavailable')
  })

  it('returns verification_unavailable on API error', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    global.fetch = mockFetchForModeration({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    })

    const { moderateImages } = await import('@/lib/verification')
    const results = await moderateImages(['https://example.com/photo.jpg'])
    expect(results).toHaveLength(1)
    expect(results[0].safe).toBe(false)
    expect(results[0].error_type).toBe('verification_unavailable')
  })

  it('returns verification_unavailable on network timeout', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    global.fetch = mockFetchForModeration(new Error('AbortError'))

    const { moderateImages } = await import('@/lib/verification')
    const results = await moderateImages(['https://example.com/photo.jpg'])
    expect(results).toHaveLength(1)
    expect(results[0].safe).toBe(false)
    expect(results[0].error_type).toBe('verification_unavailable')
  })

  it('parses successful safe moderation response', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    global.fetch = mockFetchForModeration({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({
              safe: true,
              adult_content: 0.01,
              violence: 0.02,
              self_harm: 0.0,
              reason: null,
            }),
          },
        }],
      }),
    })

    const { moderateImages } = await import('@/lib/verification')
    const results = await moderateImages(['https://example.com/photo.jpg'])
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      safe: true,
      adult_content: 0.01,
      violence: 0.02,
      self_harm: 0,
      reason: null,
    })
  })

  it('detects unsafe content and tags content_blocked', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    global.fetch = mockFetchForModeration({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({
              safe: false,
              adult_content: 0.95,
              violence: 0.1,
              self_harm: 0.0,
              reason: 'Image contains explicit adult content',
            }),
          },
        }],
      }),
    })

    const { moderateImages } = await import('@/lib/verification')
    const results = await moderateImages(['https://example.com/nsfw.jpg'])
    expect(results).toHaveLength(1)
    expect(results[0].safe).toBe(false)
    expect(results[0].adult_content).toBeGreaterThan(0.9)
    expect(results[0].error_type).toBe('content_blocked')
    expect(results[0].reason).toContain('adult content')
  })

  it('overrides relevance-based rejection (sanity check)', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    global.fetch = mockFetchForModeration({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({
              safe: false,
              adult_content: 0.0,
              violence: 0.0,
              self_harm: 0.0,
              reason: 'Image of a dog is not relevant for a business listing',
            }),
          },
        }],
      }),
    })

    const { moderateImages } = await import('@/lib/verification')
    const results = await moderateImages(['https://example.com/dog.jpg'])
    expect(results).toHaveLength(1)
    // Sanity check should override to safe
    expect(results[0].safe).toBe(true)
    expect(results[0].reason).toBeNull()
    expect(results[0].error_type).toBeUndefined()
  })

  it('handles missing content in API response', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    global.fetch = mockFetchForModeration({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: null } }] }),
    })

    const { moderateImages } = await import('@/lib/verification')
    const results = await moderateImages(['https://example.com/photo.jpg'])
    expect(results).toHaveLength(1)
    expect(results[0].safe).toBe(false)
    expect(results[0].error_type).toBe('verification_unavailable')
  })

  it('handles malformed JSON in API response', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    global.fetch = mockFetchForModeration({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'not valid json' } }],
      }),
    })

    const { moderateImages } = await import('@/lib/verification')
    const results = await moderateImages(['https://example.com/photo.jpg'])
    expect(results).toHaveLength(1)
    expect(results[0].safe).toBe(false)
    expect(results[0].error_type).toBe('verification_unavailable')
  })
})
