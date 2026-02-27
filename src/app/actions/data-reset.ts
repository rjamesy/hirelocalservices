'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

export async function resetAllData(confirmPhrase: string, secondConfirm: boolean) {
  const { supabase, user } = await requireAdmin()

  // Safety check 1: confirm phrase
  if (confirmPhrase.trim().toLowerCase() !== 'danger reset data') {
    return { error: 'Confirmation phrase does not match. Type "danger reset data" exactly.' }
  }

  // Safety check 2: second confirm
  if (!secondConfirm) {
    return { error: 'You must check the second confirmation checkbox.' }
  }

  const admin = createAdminClient()

  // Delete order (FK-safe):
  // business_metrics → photos → testimonials → business_categories →
  // verification_jobs → business_claims → business_contacts →
  // business_search_index → business_locations → subscriptions →
  // reports → businesses
  const tables = [
    'business_metrics',
    'photos',
    'testimonials',
    'business_categories',
    'verification_jobs',
    'business_claims',
    'business_contacts',
    'business_search_index',
    'business_locations',
    'subscriptions',
    'user_subscriptions',
    'user_notifications',
    'abuse_events',
    'reports',
    'businesses',
  ] as const

  for (const table of tables) {
    const { error } = await admin.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (error) {
      // business_search_index uses business_id as PK, not id
      if (table === 'business_search_index') {
        const { error: err2 } = await admin.from(table).delete().neq('business_id', '00000000-0000-0000-0000-000000000000')
        if (err2) {
          return { error: `Failed to clear ${table}: ${err2.message}` }
        }
      } else {
        return { error: `Failed to clear ${table}: ${error.message}` }
      }
    }
  }

  // Log audit event
  try {
    await supabase.rpc('insert_audit_log', {
      p_action: 'reset_executed',
      p_actor_id: user.id,
      p_details: { tables_cleared: tables },
    })
  } catch {
    // Non-blocking
  }

  return { success: true }
}
