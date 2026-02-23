import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'

const { client: mockSupabase, order, select } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

import { GET } from '@/app/api/categories/route'

describe('GET /api/categories', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns JSON array of categories', async () => {
    order.mockReturnValueOnce(
      Promise.resolve({
        data: [
          { id: '1', name: 'Cleaning', slug: 'cleaning', parent_id: null },
          { id: '2', name: 'Plumbing', slug: 'plumbing', parent_id: null },
        ],
        error: null,
      })
    )

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toHaveLength(2)
    expect(json[0]).toHaveProperty('id')
    expect(json[0]).toHaveProperty('name')
    expect(json[0]).toHaveProperty('slug')
  })

  it('returns 500 on database error', async () => {
    order.mockReturnValueOnce(
      Promise.resolve({
        data: null,
        error: { message: 'DB error' },
      })
    )

    const response = await GET()
    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json).toEqual([])
  })

  it('queries categories table ordered by name', async () => {
    order.mockReturnValueOnce(
      Promise.resolve({ data: [], error: null })
    )

    await GET()
    expect(mockSupabase.from).toHaveBeenCalledWith('categories')
    expect(select).toHaveBeenCalledWith('id, name, slug, parent_id')
    expect(order).toHaveBeenCalledWith('name')
  })
})
