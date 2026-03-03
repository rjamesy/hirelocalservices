'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Track search impressions for businesses shown in search results.
 * Called after search results are displayed. Fire-and-forget.
 */
export async function trackSearchImpressions(businessIds: string[]) {
  if (businessIds.length === 0) return

  try {
    const supabase = await createClient()
    await supabase.rpc('increment_search_impressions', {
      p_business_ids: businessIds,
    })
  } catch {
    // Non-blocking — don't fail the search experience
  }
}

/**
 * Track a profile view for a business.
 * Called when a user views a business detail page. Fire-and-forget.
 */
export async function trackProfileView(businessId: string) {
  try {
    const supabase = await createClient()
    await supabase.rpc('increment_profile_view', {
      p_business_id: businessId,
    })
  } catch {
    // Non-blocking
  }
}

/**
 * Track a contact click (phone, email, or website) for a business.
 * Called from the ContactReveal component. Fire-and-forget.
 */
export async function trackContactClick(
  businessId: string,
  clickType: 'phone' | 'email' | 'website'
) {
  try {
    const supabase = await createClient()
    await supabase.rpc('increment_contact_click', {
      p_business_id: businessId,
      p_click_type: clickType,
    })
  } catch {
    // Non-blocking
  }
}

/**
 * Get metrics summary for a business (owner or admin only).
 */
export async function getBusinessMetrics(businessId: string, days = 30) {
  const supabase = await createClient()

  // Verify caller is the business owner or an admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { total_impressions: 0, total_views: 0, total_phone_clicks: 0, total_email_clicks: 0, total_website_clicks: 0, daily_impressions: [], daily_views: [] }
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('owner_id')
    .eq('id', businessId)
    .single()

  if (!biz) {
    return { total_impressions: 0, total_views: 0, total_phone_clicks: 0, total_email_clicks: 0, total_website_clicks: 0, daily_impressions: [], daily_views: [] }
  }

  if (biz.owner_id !== user.id) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role !== 'admin') {
      return { total_impressions: 0, total_views: 0, total_phone_clicks: 0, total_email_clicks: 0, total_website_clicks: 0, daily_impressions: [], daily_views: [] }
    }
  }

  const { data, error } = await supabase.rpc('get_business_metrics', {
    p_business_id: businessId,
    p_days: days,
  })

  if (error) {
    return {
      total_impressions: 0,
      total_views: 0,
      total_phone_clicks: 0,
      total_email_clicks: 0,
      total_website_clicks: 0,
      daily_impressions: [],
      daily_views: [],
    }
  }

  // RPC returns array with single row
  const row = Array.isArray(data) ? data[0] : data
  return {
    total_impressions: Number(row?.total_impressions ?? 0),
    total_views: Number(row?.total_views ?? 0),
    total_phone_clicks: Number(row?.total_phone_clicks ?? 0),
    total_email_clicks: Number(row?.total_email_clicks ?? 0),
    total_website_clicks: Number(row?.total_website_clicks ?? 0),
    daily_impressions: row?.daily_impressions ?? [],
    daily_views: row?.daily_views ?? [],
  }
}
