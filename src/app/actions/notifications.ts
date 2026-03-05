'use server'

import { createClient } from '@/lib/supabase/server'
import type { NotificationType, UserNotification } from '@/lib/types'
import log from '@/lib/logger'

type SupabaseClient = {
  from: (table: string) => any
}

/**
 * createNotification — non-blocking insert of a user notification.
 * Called by server actions (claims, verification, suspension).
 */
export async function createNotification(
  supabase: SupabaseClient,
  params: {
    userId: string
    type: NotificationType
    title: string
    message: string
    metadata?: Record<string, unknown>
  }
) {
  try {
    await supabase.from('user_notifications').insert({
      user_id: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      metadata: params.metadata ?? {},
    })
  } catch (err) {
    log.error({ error: err }, '[notifications] Failed to create notification')
  }
}

/**
 * getUserNotifications — paginated notifications for current user.
 */
export async function getUserNotifications(page: number = 1): Promise<{
  data: UserNotification[]
  totalCount: number
  page: number
  totalPages: number
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be logged in')

  const perPage = 20
  const offset = (page - 1) * perPage

  const { data, count, error } = await supabase
    .from('user_notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + perPage - 1)

  if (error) {
    return { data: [], totalCount: 0, page, totalPages: 0 }
  }

  const totalCount = count ?? 0
  return {
    data: (data ?? []) as UserNotification[],
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / perPage),
  }
}

/**
 * markNotificationRead — mark a notification as read for current user.
 */
export async function markNotificationRead(notificationId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be logged in')

  const { error } = await supabase
    .from('user_notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('user_id', user.id)

  if (error) {
    return { error: 'Failed to mark notification as read' }
  }

  return { success: true }
}

/**
 * deleteNotification — permanently remove a notification for current user.
 */
export async function deleteNotification(notificationId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be logged in')

  const { error } = await supabase
    .from('user_notifications')
    .delete()
    .eq('id', notificationId)
    .eq('user_id', user.id)

  if (error) {
    return { error: 'Failed to delete notification' }
  }

  return { success: true }
}

/**
 * getUnreadCount — count of unread notifications for current user.
 */
export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 0

  const { count, error } = await supabase
    .from('user_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('read', false)

  if (error) return 0
  return count ?? 0
}
