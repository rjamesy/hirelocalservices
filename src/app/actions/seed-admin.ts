'use server'

import { createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') throw new Error('Not authorized')
  return { supabase, user }
}

export async function getSeedStats() {
  const { supabase } = await requireAdmin()

  // Total seeds by source
  const { data: bySource } = await supabase
    .from('businesses')
    .select('listing_source')
    .eq('is_seed', true)
    .is('deleted_at', null)

  const sourceCounts: Record<string, number> = {}
  for (const row of bySource ?? []) {
    const src = row.listing_source ?? 'unknown'
    sourceCounts[src] = (sourceCounts[src] ?? 0) + 1
  }

  // Total count
  const total = (bySource ?? []).length

  // Confidence brackets (uses raw query via RPC not available, so we fetch confidence scores)
  const { data: confData } = await supabase
    .from('businesses')
    .select('seed_confidence')
    .eq('is_seed', true)
    .is('deleted_at', null)

  const brackets = { low: 0, medium: 0, good: 0, high: 0 }
  let confSum = 0
  let confCount = 0
  for (const row of confData ?? []) {
    const c = row.seed_confidence ?? 0
    if (c < 0.3) brackets.low++
    else if (c < 0.5) brackets.medium++
    else if (c < 0.7) brackets.good++
    else brackets.high++
    confSum += c
    confCount++
  }
  const avgConfidence = confCount > 0 ? confSum / confCount : 0

  // Phone/website stats
  const { data: contactData } = await supabase
    .from('businesses')
    .select('id, business_contacts!inner(phone, website)')
    .eq('is_seed', true)
    .is('deleted_at', null)

  let withPhone = 0
  let withWebsite = 0
  for (const row of contactData ?? []) {
    const contacts = row.business_contacts as any
    if (Array.isArray(contacts)) {
      if (contacts[0]?.phone) withPhone++
      if (contacts[0]?.website) withWebsite++
    } else if (contacts) {
      if (contacts.phone) withPhone++
      if (contacts.website) withWebsite++
    }
  }

  return {
    total,
    sourceCounts,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    brackets,
    withPhone,
    withWebsite,
    withoutPhone: total - withPhone,
    withoutWebsite: total - withWebsite,
  }
}

export async function getSeedBlacklist() {
  const { supabase } = await requireAdmin()

  const { data, error } = await supabase
    .from('seed_blacklist')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return { data: [], error: error.message }
  return { data: data ?? [], error: null }
}

export async function addSeedBlacklistEntry(
  googlePlaceId: string | null,
  businessName: string | null,
  reason: string
) {
  const { supabase, user } = await requireAdmin()

  if (!googlePlaceId && !businessName) {
    return { error: 'Provide either a Google Place ID or business name.' }
  }

  const { error } = await supabase.from('seed_blacklist').insert({
    google_place_id: googlePlaceId || null,
    business_name: businessName || null,
    reason,
    created_by: user.id,
  })

  if (error) return { error: error.message }
  return { error: null }
}

export async function removeSeedBlacklistEntry(id: string) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase.from('seed_blacklist').delete().eq('id', id)
  if (error) return { error: error.message }
  return { error: null }
}
