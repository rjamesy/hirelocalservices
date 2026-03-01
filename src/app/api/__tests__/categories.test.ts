import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'

const { client: mockSupabase, order, select, eq } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

import { GET } from '@/app/api/categories/route'

describe('GET /api/categories', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  // Helper: the route chains .eq().order().order() — first order chains, second is terminal
  function mockOrderResult(result: { data: any; error: any }) {
    order
      .mockReturnValueOnce(undefined)   // first .order('sort_order') → chains
      .mockReturnValueOnce(Promise.resolve(result)) // second .order('name') → terminal
  }

  it('returns JSON array of categories', async () => {
    mockOrderResult({
      data: [
        { id: '1', name: 'Cleaning', slug: 'cleaning', parent_id: null },
        { id: '2', name: 'Plumbing', slug: 'plumbing', parent_id: null },
      ],
      error: null,
    })

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toHaveLength(2)
    expect(json[0]).toHaveProperty('id')
    expect(json[0]).toHaveProperty('name')
    expect(json[0]).toHaveProperty('slug')
  })

  it('returns 500 on database error', async () => {
    mockOrderResult({
      data: null,
      error: { message: 'DB error' },
    })

    const response = await GET()
    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json).toEqual([])
  })

  it('queries categories table with is_active filter and sort_order', async () => {
    mockOrderResult({ data: [], error: null })

    await GET()
    expect(mockSupabase.from).toHaveBeenCalledWith('categories')
    expect(select).toHaveBeenCalledWith('id, name, slug, parent_id, synonyms, keywords, sort_order')
    expect(eq).toHaveBeenCalledWith('is_active', true)
    expect(order).toHaveBeenCalledWith('sort_order', { ascending: true })
    expect(order).toHaveBeenCalledWith('name', { ascending: true })
  })
})
