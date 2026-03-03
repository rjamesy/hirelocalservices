/**
 * Blacklist checking for seed listings.
 *
 * Checks both the seed_blacklist table (by Google Place ID) and
 * the general blacklist table (by business name).
 */

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Check if a place or business name is blacklisted.
 * Returns true if the business should be skipped.
 */
export async function isBlacklisted(
  googlePlaceId: string,
  businessName: string
): Promise<boolean> {
  const supabase = getSupabase()

  // 1. Check seed_blacklist by Google Place ID
  const { data: placeBlocked } = await supabase
    .from('seed_blacklist')
    .select('id')
    .eq('google_place_id', googlePlaceId)
    .maybeSingle()

  if (placeBlocked) return true

  // 2. Check general blacklist via the is_blacklisted() RPC
  const { data: nameCheck } = await supabase.rpc('is_blacklisted', {
    p_value: businessName,
    p_field_type: 'business_name',
  })

  if (nameCheck && nameCheck.length > 0 && nameCheck[0].is_blocked) {
    return true
  }

  return false
}
