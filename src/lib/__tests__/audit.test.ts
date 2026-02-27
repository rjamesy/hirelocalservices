import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the supabase client
const mockRpc = vi.fn((): any => Promise.resolve({ data: null, error: null }))
const mockSupabase = { rpc: mockRpc }

// Import the module
import { logAudit } from '@/lib/audit'

describe('logAudit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRpc.mockResolvedValue({ data: null, error: null })
  })

  it('calls insert_audit_log RPC with correct params', async () => {
    await logAudit(mockSupabase as any, {
      action: 'listing_suspended',
      entityType: 'listing',
      entityId: 'biz-123',
      actorId: 'user-456',
      details: { listing_name: 'Test Biz', previous_status: 'published', new_status: 'suspended' },
    })

    expect(mockRpc).toHaveBeenCalledWith('insert_audit_log', {
      p_action: 'listing_suspended',
      p_entity_type: 'listing',
      p_entity_id: 'biz-123',
      p_actor_id: 'user-456',
      p_details: { listing_name: 'Test Biz', previous_status: 'published', new_status: 'suspended' },
    })
  })

  it('defaults details to empty object when omitted', async () => {
    await logAudit(mockSupabase as any, {
      action: 'listing_created',
      entityType: 'listing',
      entityId: 'biz-1',
      actorId: 'user-1',
    })

    expect(mockRpc).toHaveBeenCalledWith('insert_audit_log', {
      p_action: 'listing_created',
      p_entity_type: 'listing',
      p_entity_id: 'biz-1',
      p_actor_id: 'user-1',
      p_details: {},
    })
  })

  it('does not throw on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    await expect(
      logAudit(mockSupabase as any, {
        action: 'listing_suspended',
        entityType: 'listing',
        entityId: 'biz-1',
        actorId: 'user-1',
      })
    ).resolves.toBeUndefined()
  })

  it('does not throw on unexpected exception', async () => {
    mockRpc.mockRejectedValue(new Error('Network error'))

    await expect(
      logAudit(mockSupabase as any, {
        action: 'listing_created',
        entityType: 'listing',
        entityId: 'biz-1',
        actorId: 'user-1',
      })
    ).resolves.toBeUndefined()
  })

  it('passes all audit action types correctly', async () => {
    const actions = [
      'listing_created',
      'listing_updated',
      'listing_suspended',
      'listing_unsuspended',
      'listing_claim_submitted',
      'listing_claim_approved',
      'listing_claim_rejected',
    ] as const

    for (const action of actions) {
      mockRpc.mockClear()
      await logAudit(mockSupabase as any, {
        action,
        entityType: 'listing',
        entityId: 'biz-1',
        actorId: 'user-1',
      })
      expect(mockRpc).toHaveBeenCalledWith('insert_audit_log', expect.objectContaining({
        p_action: action,
      }))
    }
  })
})
