/**
 * Image Moderation Tests
 *
 * Tests the moderateImages function from verification.ts
 * - Returns empty array for empty input
 * - Approves all when no API key
 * - Handles API success responses
 * - Graceful degradation on API errors and timeouts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We need to test the function with different env states
const originalEnv = { ...process.env }

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

  it('approves all when no API key', async () => {
    delete process.env.OPENAI_API_KEY
    const { moderateImages } = await import('@/lib/verification')
    const results = await moderateImages([
      'https://example.com/photo1.jpg',
      'https://example.com/photo2.jpg',
    ])
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      safe: true,
      adult_content: 0,
      violence: 0,
      spam_watermark: 0,
      reason: null,
    })
    expect(results[1]).toEqual({
      safe: true,
      adult_content: 0,
      violence: 0,
      spam_watermark: 0,
      reason: null,
    })
  })

  it('approves on API error (graceful degradation)', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    const { moderateImages } = await import('@/lib/verification')
    const results = await moderateImages(['https://example.com/photo.jpg'])
    expect(results).toHaveLength(1)
    expect(results[0].safe).toBe(true)
  })

  it('approves on network timeout (graceful degradation)', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    global.fetch = vi.fn().mockRejectedValue(new Error('AbortError'))

    const { moderateImages } = await import('@/lib/verification')
    const results = await moderateImages(['https://example.com/photo.jpg'])
    expect(results).toHaveLength(1)
    expect(results[0].safe).toBe(true)
  })

  it('parses successful moderation response', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({
              safe: true,
              adult_content: 0.01,
              violence: 0.02,
              spam_watermark: 0.0,
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
      spam_watermark: 0,
      reason: null,
    })
  })

  it('detects unsafe content', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({
              safe: false,
              adult_content: 0.95,
              violence: 0.1,
              spam_watermark: 0.0,
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
    expect(results[0].reason).toContain('adult content')
  })

  it('handles missing content in API response', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: null } }] }),
    })

    const { moderateImages } = await import('@/lib/verification')
    const results = await moderateImages(['https://example.com/photo.jpg'])
    expect(results).toHaveLength(1)
    expect(results[0].safe).toBe(true)
  })

  it('handles malformed JSON in API response', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'not valid json' } }],
      }),
    })

    const { moderateImages } = await import('@/lib/verification')
    const results = await moderateImages(['https://example.com/photo.jpg'])
    expect(results).toHaveLength(1)
    // Should gracefully approve on parse error
    expect(results[0].safe).toBe(true)
  })

  it('processes multiple images', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    let callCount = 0
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++
      const safe = callCount !== 2 // Second image is unsafe
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                safe,
                adult_content: safe ? 0.01 : 0.95,
                violence: 0,
                spam_watermark: 0,
                reason: safe ? null : 'Explicit content',
              }),
            },
          }],
        }),
      })
    })

    const { moderateImages } = await import('@/lib/verification')
    const results = await moderateImages([
      'https://example.com/photo1.jpg',
      'https://example.com/nsfw.jpg',
      'https://example.com/photo3.jpg',
    ])
    expect(results).toHaveLength(3)
    expect(results[0].safe).toBe(true)
    expect(results[1].safe).toBe(false)
    expect(results[2].safe).toBe(true)
  })
})
