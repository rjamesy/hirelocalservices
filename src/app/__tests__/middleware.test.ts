import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockUpdateSession = vi.fn()

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: (...args: unknown[]) => mockUpdateSession(...args),
}))

import { middleware } from '@/middleware'

function makeRequest(path: string) {
  return new NextRequest(new URL(path, 'http://localhost:3000'))
}

describe('middleware', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  // --- Public routes ---

  it('allows unauthenticated access to /', async () => {
    const supabaseResponse = NextResponse.next()
    mockUpdateSession.mockResolvedValue({
      supabaseResponse,
      user: null,
      supabase: { from: vi.fn() },
    })

    const response = await middleware(makeRequest('/'))
    expect(response.status).not.toBe(307) // no redirect
  })

  it('allows unauthenticated access to /pricing', async () => {
    const supabaseResponse = NextResponse.next()
    mockUpdateSession.mockResolvedValue({
      supabaseResponse,
      user: null,
      supabase: { from: vi.fn() },
    })

    const response = await middleware(makeRequest('/pricing'))
    expect(response.status).not.toBe(307)
  })

  it('allows unauthenticated access to /search', async () => {
    const supabaseResponse = NextResponse.next()
    mockUpdateSession.mockResolvedValue({
      supabaseResponse,
      user: null,
      supabase: { from: vi.fn() },
    })

    const response = await middleware(makeRequest('/search'))
    expect(response.status).not.toBe(307)
  })

  // --- Dashboard protection ---

  it('redirects unauthenticated users from /dashboard to /login', async () => {
    const supabaseResponse = NextResponse.next()
    mockUpdateSession.mockResolvedValue({
      supabaseResponse,
      user: null,
      supabase: { from: vi.fn() },
    })

    const response = await middleware(makeRequest('/dashboard'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
    expect(response.headers.get('location')).toContain('redirect=%2Fdashboard')
  })

  it('redirects from /dashboard/settings with redirect param', async () => {
    const supabaseResponse = NextResponse.next()
    mockUpdateSession.mockResolvedValue({
      supabaseResponse,
      user: null,
      supabase: { from: vi.fn() },
    })

    const response = await middleware(makeRequest('/dashboard/settings'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('redirect=%2Fdashboard%2Fsettings')
  })

  it('allows authenticated users to access /dashboard', async () => {
    const supabaseResponse = NextResponse.next()
    mockUpdateSession.mockResolvedValue({
      supabaseResponse,
      user: { id: 'user-1' },
      supabase: { from: vi.fn() },
    })

    const response = await middleware(makeRequest('/dashboard'))
    expect(response.status).not.toBe(307)
  })

  // --- Admin protection ---

  it('redirects unauthenticated users from /admin to /login', async () => {
    const supabaseResponse = NextResponse.next()
    mockUpdateSession.mockResolvedValue({
      supabaseResponse,
      user: null,
      supabase: { from: vi.fn() },
    })

    const response = await middleware(makeRequest('/admin'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
  })

  it('redirects non-admin users from /admin to /', async () => {
    const supabaseResponse = NextResponse.next()
    const mockFrom = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({ data: { role: 'business' }, error: null })
          ),
        })),
      })),
    }))
    mockUpdateSession.mockResolvedValue({
      supabaseResponse,
      user: { id: 'user-1' },
      supabase: { from: mockFrom },
    })

    const response = await middleware(makeRequest('/admin'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/')
    expect(response.headers.get('location')).not.toContain('/login')
  })

  it('allows admin users to access /admin', async () => {
    const supabaseResponse = NextResponse.next()
    const mockFrom = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({ data: { role: 'admin' }, error: null })
          ),
        })),
      })),
    }))
    mockUpdateSession.mockResolvedValue({
      supabaseResponse,
      user: { id: 'admin-1' },
      supabase: { from: mockFrom },
    })

    const response = await middleware(makeRequest('/admin'))
    expect(response.status).not.toBe(307)
  })

  // --- Session refresh ---

  it('calls updateSession for every request', async () => {
    const supabaseResponse = NextResponse.next()
    mockUpdateSession.mockResolvedValue({
      supabaseResponse,
      user: null,
      supabase: { from: vi.fn() },
    })

    await middleware(makeRequest('/'))
    expect(mockUpdateSession).toHaveBeenCalledTimes(1)
  })
})
