/**
 * Abuse Simulation Tests
 *
 * These tests verify the platform fails safely under abuse conditions.
 * Run manually: npx playwright test e2e/abuse-simulation.spec.ts
 *
 * NOTE: These tests hit rate limiters and may leave abuse_events in the DB.
 * Run cleanup-e2e.ts afterwards if needed.
 */
import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

test.describe('Abuse Simulation', () => {
  test.describe.configure({ mode: 'serial' })

  test('registration flood is rate limited after 5 attempts', async ({ request }) => {
    const results: number[] = []

    for (let i = 0; i < 8; i++) {
      const resp = await request.post(`${BASE_URL}/auth/sign-up`, {
        form: {
          email: `flood-${i}-${Date.now()}@abuse-test.local`,
          password: 'TestPassword123!',
        },
      })
      results.push(resp.status())
    }

    // First few should succeed (200/302), later ones should be rate limited
    const blocked = results.filter((s) => s === 429 || s === 403)
    expect(blocked.length).toBeGreaterThan(0)
  })

  test('login flood is rate limited after 20 attempts', async ({ request }) => {
    const results: number[] = []

    for (let i = 0; i < 25; i++) {
      const resp = await request.post(`${BASE_URL}/auth/sign-in`, {
        form: {
          email: `nonexistent-${i}@abuse-test.local`,
          password: 'wrong',
        },
      })
      results.push(resp.status())
    }

    const blocked = results.filter((s) => s === 429 || s === 403)
    expect(blocked.length).toBeGreaterThan(0)
  })

  test('claim without captcha token is rejected', async ({ request }) => {
    for (let i = 0; i < 3; i++) {
      const resp = await request.post(`${BASE_URL}/api/claims`, {
        data: {
          businessId: '00000000-0000-0000-0000-000000000000',
          captchaToken: '',
        },
      })
      // Should fail with 4xx (unauthorized, bad request, or forbidden)
      expect(resp.status()).toBeGreaterThanOrEqual(400)
    }
  })

  test('large file upload is rejected', async ({ request }) => {
    // Create a buffer > 10MB
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'x')
    const resp = await request.post(`${BASE_URL}/api/upload`, {
      multipart: {
        file: {
          name: 'huge-file.jpg',
          mimeType: 'image/jpeg',
          buffer: largeBuffer,
        },
      },
    })
    // Should be rejected (413 or 400)
    expect(resp.status()).toBeGreaterThanOrEqual(400)
  })

  test('invalid mime type upload is rejected', async ({ request }) => {
    const resp = await request.post(`${BASE_URL}/api/upload`, {
      multipart: {
        file: {
          name: 'malware.exe',
          mimeType: 'application/x-msdownload',
          buffer: Buffer.from('not a real exe'),
        },
      },
    })
    expect(resp.status()).toBeGreaterThanOrEqual(400)
  })
})
