import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockSupabaseClient } from '@/__tests__/helpers/supabase-mock'
import { mockUser } from '@/__tests__/helpers/test-data'

const { client: mockSupabase, single, chainResult, eq } = createMockSupabaseClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

import {
  createNotification,
  getUserNotifications,
  markNotificationRead,
  deleteNotification,
  getUnreadCount,
} from '../notifications'

function setupAuth() {
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: mockUser },
    error: null,
  })
}

// ─── createNotification ────────────────────────────────────────────

describe('createNotification', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('inserts into user_notifications', async () => {
    // createNotification takes a supabase client directly
    // chainResult handles the insert() await
    chainResult.mockReturnValueOnce({ data: null, error: null })

    await createNotification(mockSupabase, {
      userId: 'user-123',
      type: 'claim_approved',
      title: 'Claim Approved',
      message: 'Your claim has been approved.',
      metadata: { businessId: 'biz-1' },
    })

    expect(mockSupabase.from).toHaveBeenCalledWith('user_notifications')
  })
})

// ─── getUserNotifications ──────────────────────────────────────────

describe('getUserNotifications', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('requires auth', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })
    await expect(getUserNotifications()).rejects.toThrow('logged in')
  })

  it('returns paginated results for the current user', async () => {
    setupAuth()

    const mockNotifications = [
      {
        id: 'notif-1',
        user_id: 'user-123',
        type: 'claim_approved',
        title: 'Claim Approved',
        message: 'Your claim has been approved.',
        metadata: {},
        read: false,
        created_at: '2024-06-01T00:00:00Z',
      },
    ]

    chainResult.mockReturnValueOnce({
      data: mockNotifications,
      count: 1,
      error: null,
    })

    const result = await getUserNotifications(1)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).toBe('notif-1')
    expect(result.totalCount).toBe(1)
    expect(result.page).toBe(1)
  })
})

// ─── markNotificationRead ──────────────────────────────────────────

describe('markNotificationRead', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('requires auth', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })
    await expect(markNotificationRead('notif-1')).rejects.toThrow('logged in')
  })

  it('updates read=true only for own notification', async () => {
    setupAuth()

    // update().eq().eq() — chainResult for the direct await
    chainResult.mockReturnValueOnce({ data: null, error: null })

    const result = await markNotificationRead('notif-1')
    expect(result).toEqual({ success: true })
    // Verify eq was called with the notification id and user_id
    expect(eq).toHaveBeenCalledWith('id', 'notif-1')
    expect(eq).toHaveBeenCalledWith('user_id', 'user-123')
  })
})

// ─── deleteNotification ─────────────────────────────────────────────

describe('deleteNotification', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('requires auth', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })
    await expect(deleteNotification('notif-1')).rejects.toThrow('logged in')
  })

  it('deletes only own notification', async () => {
    setupAuth()

    chainResult.mockReturnValueOnce({ data: null, error: null })

    const result = await deleteNotification('notif-1')
    expect(result).toEqual({ success: true })
    expect(eq).toHaveBeenCalledWith('id', 'notif-1')
    expect(eq).toHaveBeenCalledWith('user_id', 'user-123')
  })

  it('returns error on failure', async () => {
    setupAuth()

    chainResult.mockReturnValueOnce({ data: null, error: { message: 'db error' } })

    const result = await deleteNotification('notif-1')
    expect(result).toEqual({ error: 'Failed to delete notification' })
  })
})

// ─── getUnreadCount ────────────────────────────────────────────────

describe('getUnreadCount', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('requires auth — returns 0 if not logged in', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })

    const count = await getUnreadCount()
    expect(count).toBe(0)
  })

  it('returns count of unread notifications', async () => {
    setupAuth()

    // select with count and head:true — direct await via chainResult
    chainResult.mockReturnValueOnce({
      data: null,
      count: 5,
      error: null,
    })

    const count = await getUnreadCount()
    expect(count).toBe(5)
  })
})
