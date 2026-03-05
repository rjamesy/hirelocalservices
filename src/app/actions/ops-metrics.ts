'use server'

import { createClient } from '@/lib/supabase/server'
import log from '@/lib/logger'

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

export async function getSubscriptionMetrics(days: number = 30) {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('get_subscription_metrics', { p_days: days })
  if (error) {
    log.error({ error }, 'Subscription metrics error')
    return null
  }
  return data
}

export async function getListingMetrics(days: number = 30) {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('get_listing_metrics', { p_days: days })
  if (error) {
    log.error({ error }, 'Listing metrics error')
    return null
  }
  return data
}

export async function getModerationMetrics(days: number = 30) {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('get_moderation_metrics', { p_days: days })
  if (error) {
    log.error({ error }, 'Moderation metrics error')
    return null
  }
  return data
}
