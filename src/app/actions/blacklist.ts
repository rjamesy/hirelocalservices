'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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

export async function getBlacklistEntries() {
  const { supabase } = await requireAdmin()

  const { data, error } = await supabase
    .from('blacklist')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) return { data: [] }
  return { data: data ?? [] }
}

export async function addBlacklistEntry(
  term: string,
  matchType: 'exact' | 'contains' | 'starts_with',
  reason?: string
) {
  const { supabase, user } = await requireAdmin()

  if (!term || term.trim().length === 0) {
    return { error: 'Term is required' }
  }

  const { error } = await supabase.from('blacklist').insert({
    term: term.trim().toLowerCase(),
    match_type: matchType,
    reason: reason || null,
    added_by: user.id,
    is_active: true,
  })

  if (error) {
    if (error.code === '23505') {
      return { error: 'This term already exists in the blacklist' }
    }
    return { error: 'Failed to add blacklist entry' }
  }

  revalidatePath('/admin/blacklist')
  return { success: true }
}

export async function removeBlacklistEntry(entryId: string) {
  const { supabase } = await requireAdmin()

  await supabase
    .from('blacklist')
    .update({ is_active: false })
    .eq('id', entryId)

  revalidatePath('/admin/blacklist')
  return { success: true }
}

/**
 * Check a business name against the database blacklist.
 * This is the authoritative check (vs quickBlacklistCheck which is client-side).
 */
export async function checkBlacklist(name: string) {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('is_blacklisted', {
    p_value: name,
    p_field_type: 'business_name',
  })

  if (error || !data || data.length === 0) {
    return { is_blocked: false, matched_term: null, reason: null }
  }

  return data[0]
}
