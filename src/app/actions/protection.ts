'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getSystemFlagsSafe,
  updateSystemFlag,
  resetCircuitBreaker,
  invalidateFlagsCache,
} from '@/lib/protection'
import { logAudit } from '@/lib/audit'
import type { SystemFlags, AbuseEventType } from '@/lib/types'

// ─── Helpers ────────────────────────────────────────────────────────

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

// ─── Public: Safe subset of flags for client components ─────────────

export async function getPublicProtectionFlags(): Promise<{
  captcha_required: boolean
  maintenance_mode: boolean
  registrations_enabled: boolean
}> {
  const flags = await getSystemFlagsSafe()
  return {
    captcha_required: flags.captcha_required,
    maintenance_mode: flags.maintenance_mode,
    registrations_enabled: flags.registrations_enabled,
  }
}

// ─── Admin: Full protection data ────────────────────────────────────

export async function getAdminProtectionData() {
  const { supabase } = await requireAdmin()
  const adminClient = createAdminClient()

  const flags = await getSystemFlagsSafe()

  // Abuse event counts (last 5 minutes)
  const eventTypes: AbuseEventType[] = [
    'failed_registration',
    'rate_limit_violation',
    'rejected_listing',
    'captcha_failure',
    'email_unverified_attempt',
  ]

  const counts: Record<string, number> = {}
  for (const type of eventTypes) {
    const { data } = await adminClient.rpc('get_abuse_event_count', {
      p_event_type: type,
      p_minutes: 5,
    })
    counts[type] = Number(data) || 0
  }

  // Recent abuse events (last 20)
  const { data: recentEvents } = await adminClient
    .from('abuse_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  return {
    flags,
    abuseCounts: counts,
    recentEvents: recentEvents ?? [],
  }
}

// ─── Admin: Update a single protection flag ─────────────────────────

export async function updateProtectionFlag(
  flag: keyof SystemFlags,
  value: unknown
) {
  const { supabase, user } = await requireAdmin()

  // Get previous value for audit log
  const currentFlags = await getSystemFlagsSafe()
  const previousValue = currentFlags[flag]

  const result = await updateSystemFlag(flag, value)
  if (!result.success) {
    return { error: result.error }
  }

  await logAudit(supabase, {
    action: 'protection_flag_changed',
    entityType: 'system_flags',
    entityId: '1',
    actorId: user.id,
    details: { flag, previous_value: previousValue, new_value: value },
  })

  return { success: true }
}

// ─── Admin: Kill switch — disable registrations ─────────────────────

export async function activateKillSwitch() {
  const { supabase, user } = await requireAdmin()

  await updateSystemFlag('registrations_enabled', false)

  await logAudit(supabase, {
    action: 'kill_switch_activated',
    entityType: 'system_flags',
    entityId: '1',
    actorId: user.id,
    details: { action: 'registrations_disabled' },
  })

  return { success: true }
}

// ─── Admin: Enable maintenance mode ─────────────────────────────────

export async function activateMaintenanceMode(message?: string) {
  const { supabase, user } = await requireAdmin()

  await updateSystemFlag('maintenance_mode', true)
  if (message) {
    await updateSystemFlag('maintenance_message', message)
  }

  await logAudit(supabase, {
    action: 'maintenance_mode_changed',
    entityType: 'system_flags',
    entityId: '1',
    actorId: user.id,
    details: { enabled: true, message: message ?? null },
  })

  return { success: true }
}

// ─── Admin: Reset circuit breaker ───────────────────────────────────

export async function adminResetCircuitBreaker() {
  const { user } = await requireAdmin()
  await resetCircuitBreaker(user.id)
  return { success: true }
}
