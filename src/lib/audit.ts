import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuditAction } from '@/lib/types'

/**
 * Log an audit event using an existing Supabase client.
 * Non-blocking — errors are caught and logged but never thrown.
 */
export async function logAudit(
  supabase: SupabaseClient,
  params: {
    action: AuditAction
    entityType: string
    entityId: string
    actorId: string
    details?: Record<string, unknown>
  }
) {
  try {
    const { error } = await supabase.rpc('insert_audit_log', {
      p_action: params.action,
      p_entity_type: params.entityType,
      p_entity_id: params.entityId,
      p_actor_id: params.actorId,
      p_details: params.details ?? {},
    })
    if (error) {
      console.error('[audit] Failed to log event:', params.action, error.message)
    }
  } catch (err) {
    console.error('[audit] Unexpected error logging event:', params.action, err)
  }
}
