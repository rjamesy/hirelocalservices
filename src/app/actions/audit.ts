'use server'

import { createClient } from '@/lib/supabase/server'
import type { AuditAction, AuditLogEntry } from '@/lib/types'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be logged in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    throw new Error('You must be an admin')
  }
  return { supabase, user }
}

export async function logAuditEvent(params: {
  action: AuditAction
  entityType?: string
  entityId?: string
  actorId?: string
  details?: Record<string, unknown>
}) {
  try {
    const supabase = await createClient()
    const { logAudit } = await import('@/lib/audit')
    await logAudit(supabase, {
      action: params.action,
      entityType: params.entityType ?? '',
      entityId: params.entityId ?? '',
      actorId: params.actorId ?? '',
      details: params.details,
    })
  } catch {
    // Non-blocking — swallow errors
  }
}

const AUDIT_PAGE_SIZE = 50

export interface AuditFilters {
  page?: number
  dateFrom?: string
  dateTo?: string
  action?: string
  actorId?: string
  entityType?: string
  entityId?: string
}

export async function getAuditLog(
  pageOrFilters: number | AuditFilters = 1
): Promise<{
  data: AuditLogEntry[]
  totalCount: number
  page: number
  totalPages: number
}> {
  const { supabase } = await requireAdmin()

  // Support both old signature (page number) and new signature (filters)
  const filters: AuditFilters = typeof pageOrFilters === 'number'
    ? { page: pageOrFilters }
    : pageOrFilters

  const page = filters.page ?? 1
  const offset = (page - 1) * AUDIT_PAGE_SIZE

  let query = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + AUDIT_PAGE_SIZE - 1)

  if (filters.dateFrom) {
    query = query.gte('created_at', filters.dateFrom)
  }
  if (filters.dateTo) {
    query = query.lte('created_at', filters.dateTo + 'T23:59:59.999Z')
  }
  if (filters.action) {
    query = query.eq('action', filters.action as AuditAction)
  }
  if (filters.actorId) {
    query = query.eq('actor_id', filters.actorId)
  }
  if (filters.entityType) {
    query = query.eq('entity_type', filters.entityType)
  }
  if (filters.entityId) {
    query = query.eq('entity_id', filters.entityId)
  }

  const { data, count, error } = await query

  if (error) {
    return { data: [], totalCount: 0, page, totalPages: 0 }
  }

  const totalCount = count ?? 0
  return {
    data: (data ?? []) as AuditLogEntry[],
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / AUDIT_PAGE_SIZE),
  }
}

/**
 * getAuditActors — return admin profiles for the actor filter dropdown.
 */
export async function getAuditActors(): Promise<Array<{ id: string; email: string }>> {
  const { supabase } = await requireAdmin()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('role', 'admin')
    .order('email', { ascending: true })

  if (error) return []
  return (data ?? []) as Array<{ id: string; email: string }>
}
