'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/app/actions/notifications'
import type { AlertSeverity, SystemAlert } from '@/lib/types'

// ─── Public (service-role) ──────────────────────────────────────────

/**
 * createSystemAlert — insert a system alert and notify all admins.
 * Uses service_role client so RLS INSERT policy passes.
 * Called from protection.ts (circuit breaker), not from client.
 */
export async function createSystemAlert(
  severity: AlertSeverity,
  title: string,
  body?: string,
  source?: string,
  metadata?: Record<string, unknown>
): Promise<{ id: string | null; error: string | null }> {
  try {
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('system_alerts')
      .insert({
        severity,
        title,
        body: body ?? null,
        source: source ?? null,
        metadata: metadata ?? {},
      })
      .select('id')
      .single()

    if (error) {
      console.error('[alerts] Failed to create system alert:', error.message)
      return { id: null, error: error.message }
    }

    // Notify all admin users (fire-and-forget)
    const { data: admins } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')

    for (const adminUser of admins ?? []) {
      await createNotification(admin, {
        userId: adminUser.id,
        type: 'system_alert',
        title,
        message: body ?? title,
        metadata: { alertId: data.id, severity, source: source ?? null },
      })
    }

    return { id: data.id, error: null }
  } catch (err) {
    console.error('[alerts] Unexpected error creating alert:', err)
    return { id: null, error: 'Unexpected error' }
  }
}

// ─── Admin ──────────────────────────────────────────────────────────

/**
 * getSystemAlerts — fetch alerts with optional filters. Admin only.
 */
export async function getSystemAlerts(opts: {
  resolved?: boolean
  days?: number
} = {}): Promise<{ data: SystemAlert[]; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return { data: [], error: 'Not authorized' }

  let query = supabase
    .from('system_alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (opts.resolved === false) {
    query = query.is('resolved_at', null)
  } else if (opts.resolved === true) {
    query = query.not('resolved_at', 'is', null)
  }

  if (opts.days) {
    const since = new Date(Date.now() - opts.days * 86400000).toISOString()
    query = query.gte('created_at', since)
  }

  const { data, error } = await query

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as SystemAlert[], error: null }
}

/**
 * resolveAlert — mark a system alert as resolved. Admin only.
 */
export async function resolveAlert(alertId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return { error: 'Not authorized' }

  const { error } = await supabase
    .from('system_alerts')
    .update({ resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq('id', alertId)

  if (error) return { error: error.message }
  return { error: null }
}
