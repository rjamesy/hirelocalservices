'use server'

import { createClient } from '@/lib/supabase/server'
import { reportSchema } from '@/lib/validations'
import { headers } from 'next/headers'
import { createHash } from 'crypto'

// ─── Constants ──────────────────────────────────────────────────────

const MAX_REPORTS_PER_IP_PER_HOUR = 5
const REPORT_WINDOW_MS = 60 * 60 * 1000 // 1 hour in milliseconds

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Hash the client IP address for privacy-preserving rate limiting.
 * We use SHA-256 with a server-side salt to prevent rainbow table attacks.
 */
function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || 'hls-default-salt-change-me'
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex')
}

/**
 * Extract the client IP from the request headers.
 * Prioritises x-forwarded-for (set by reverse proxies like Vercel),
 * then x-real-ip, with a fallback to 'unknown'.
 */
async function getClientIp(): Promise<string> {
  const headersList = await headers()

  // x-forwarded-for may contain a comma-separated list; take the first IP
  const forwarded = headersList.get('x-forwarded-for')
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]?.trim()
    if (firstIp) return firstIp
  }

  const realIp = headersList.get('x-real-ip')
  if (realIp) return realIp

  return 'unknown'
}

// ─── Server Actions ─────────────────────────────────────────────────

export async function reportBusiness(
  businessId: string,
  formData: FormData
) {
  const supabase = await createClient()

  // Validate that the business exists
  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .maybeSingle()

  if (bizError || !business) {
    return { error: 'Business not found' }
  }

  // Validate form data
  const rawData = {
    reason: formData.get('reason') as string,
    details: formData.get('details') as string,
  }

  const parsed = reportSchema.safeParse(rawData)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  // Hash the reporter's IP
  const clientIp = await getClientIp()
  const ipHash = hashIp(clientIp)

  // Rate limit: check how many reports this IP has submitted in the last hour
  const oneHourAgo = new Date(Date.now() - REPORT_WINDOW_MS).toISOString()

  const { count, error: countError } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('reporter_ip_hash', ipHash)
    .gte('created_at', oneHourAgo)

  if (countError) {
    return { error: 'Failed to check rate limit. Please try again.' }
  }

  if (count !== null && count >= MAX_REPORTS_PER_IP_PER_HOUR) {
    return {
      error:
        'You have submitted too many reports recently. Please try again later.',
    }
  }

  // Insert the report
  const { error: insertError } = await supabase.from('reports').insert({
    business_id: businessId,
    reporter_ip_hash: ipHash,
    reason: parsed.data.reason,
    details: parsed.data.details || null,
    status: 'open',
  })

  if (insertError) {
    return { error: 'Failed to submit report. Please try again.' }
  }

  return { success: true }
}
