'use server'

import { createClient } from '@/lib/supabase/server'
import type { SystemSettingKey } from '@/lib/types'

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

export async function getSettings(): Promise<Record<string, unknown>> {
  const { supabase } = await requireAdmin()

  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value')

  if (error || !data) return {}

  const result: Record<string, unknown> = {}
  for (const row of data) {
    result[row.key] = row.value
  }
  return result
}

export async function updateSetting(key: SystemSettingKey, value: unknown) {
  const { supabase, user } = await requireAdmin()

  // Fetch previous value before upsert
  let previousValue: unknown = null
  try {
    const { data: existing } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    if (existing) previousValue = existing.value
  } catch {
    // Non-blocking
  }

  const { error } = await supabase
    .from('system_settings')
    .upsert(
      { key, value: value as any, updated_by: user.id, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (error) {
    console.error('Failed to update setting:', key, error)
    return { error: `Failed to update setting "${key}": ${error.message}` }
  }

  // Log audit event with previous_value and new_value
  try {
    await supabase.rpc('insert_audit_log', {
      p_action: 'settings_changed',
      p_entity_type: 'system_settings',
      p_actor_id: user.id,
      p_details: { key, previous_value: previousValue, new_value: value },
    })
  } catch {
    // Non-blocking
  }

  return { success: true }
}

export async function getSettingValue<T>(key: SystemSettingKey, fallback: T): Promise<T> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', key)
      .single()

    if (error || !data) return fallback
    return data.value as T
  } catch {
    return fallback
  }
}
