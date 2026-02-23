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
    await supabase.rpc('insert_audit_log', {
      p_action: params.action,
      p_entity_type: params.entityType ?? null,
      p_entity_id: params.entityId ?? null,
      p_actor_id: params.actorId ?? null,
      p_details: params.details ?? {},
    })
  } catch {
    // Non-blocking — swallow errors
  }
}

const AUDIT_PAGE_SIZE = 50

export async function getAuditLog(page: number = 1): Promise<{
  data: AuditLogEntry[]
  totalCount: number
  page: number
  totalPages: number
}> {
  const { supabase } = await requireAdmin()

  const offset = (page - 1) * AUDIT_PAGE_SIZE

  const { data, count, error } = await supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + AUDIT_PAGE_SIZE - 1)

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
