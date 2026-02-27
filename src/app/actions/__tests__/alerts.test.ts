import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock admin client (service role) ────────────────────────────────

const mockAdminInsertSingle = vi.fn()
const mockAdminSelectThen = vi.fn()

function buildAdminChain(terminal?: () => any) {
  const chain: Record<string, any> = {}
  const methods = ['insert', 'select', 'update', 'eq', 'order', 'limit', 'is', 'not', 'gte']
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.single = terminal ?? vi.fn(() => Promise.resolve({ data: null, error: null }))
  chain.then = vi.fn((resolve: (val: unknown) => void) =>
    resolve(mockAdminSelectThen())
  )
  return chain
}

const mockAdminFrom = vi.fn()
const mockAdminClient = { from: mockAdminFrom }

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdminClient,
}))

// ─── Mock server client (auth-based) ────────────────────────────────

const mockServerSingle = vi.fn()
const mockServerThen = vi.fn()

function buildServerChain() {
  const chain: Record<string, any> = {}
  const methods = ['select', 'update', 'eq', 'order', 'limit', 'is', 'not', 'gte']
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.single = mockServerSingle
  chain.then = vi.fn((resolve: (val: unknown) => void) =>
    resolve(mockServerThen())
  )
  return chain
}

const mockServerFrom = vi.fn(() => buildServerChain())
const mockAuthGetUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({
    from: mockServerFrom,
    auth: { getUser: mockAuthGetUser },
  }),
}))

vi.mock('@/app/actions/notifications', () => ({
  createNotification: vi.fn(),
}))

import { createSystemAlert, getSystemAlerts, resolveAlert } from '../alerts'

describe('alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  })

  describe('createSystemAlert', () => {
    it('inserts alert and returns id', async () => {
      // First from('system_alerts') → insert → select → single
      const alertChain = buildAdminChain(
        vi.fn(() => Promise.resolve({ data: { id: 'alert-1' }, error: null }))
      )
      // Second from('profiles') → select → eq → .then
      const profilesChain = buildAdminChain()
      profilesChain.then = vi.fn((resolve: (val: unknown) => void) =>
        resolve({ data: [{ id: 'admin-1' }], error: null })
      )

      mockAdminFrom
        .mockReturnValueOnce(alertChain)
        .mockReturnValueOnce(profilesChain)

      const result = await createSystemAlert('critical', 'Test Alert', 'Test body', 'test')

      expect(result.id).toBe('alert-1')
      expect(result.error).toBeNull()
    })

    it('returns error on insert failure', async () => {
      const alertChain = buildAdminChain(
        vi.fn(() => Promise.resolve({ data: null, error: { message: 'DB error' } }))
      )
      mockAdminFrom.mockReturnValueOnce(alertChain)

      const result = await createSystemAlert('warning', 'Fail Alert')

      expect(result.error).toBe('DB error')
      expect(result.id).toBeNull()
    })
  })

  describe('getSystemAlerts', () => {
    it('returns alerts for admin user', async () => {
      // Profile check → admin
      mockServerSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
      // Alerts query → .then
      mockServerThen.mockReturnValueOnce({ data: [{ id: 'a1', severity: 'critical' }], error: null })

      const result = await getSystemAlerts({ days: 7 })

      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
    })

    it('rejects non-admin user', async () => {
      mockServerSingle.mockResolvedValueOnce({ data: { role: 'business' }, error: null })

      const result = await getSystemAlerts()

      expect(result.error).toBe('Not authorized')
      expect(result.data).toEqual([])
    })

    it('rejects unauthenticated user', async () => {
      mockAuthGetUser.mockResolvedValue({ data: { user: null } })

      const result = await getSystemAlerts()

      expect(result.error).toBe('Not authenticated')
    })
  })

  describe('resolveAlert', () => {
    it('sets resolved_at for admin', async () => {
      // Profile check
      mockServerSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
      // Update query resolves via .then
      mockServerThen.mockReturnValueOnce({ data: null, error: null })

      const result = await resolveAlert('alert-1')

      expect(result.error).toBeNull()
      expect(mockServerFrom).toHaveBeenCalledWith('system_alerts')
    })

    it('rejects non-admin', async () => {
      mockServerSingle.mockResolvedValueOnce({ data: { role: 'business' }, error: null })

      const result = await resolveAlert('alert-1')

      expect(result.error).toBe('Not authorized')
    })
  })
})
