import { createAdminClient } from '@/lib/supabase/admin'
import type { SystemFlags, AbuseEventType } from '@/lib/types'
import { logAudit } from '@/lib/audit'
import { createSystemAlert } from '@/app/actions/alerts'

// ─── Safe Defaults (fail-open) ──────────────────────────────────────

const SAFE_DEFAULTS: SystemFlags = {
  id: 1,
  registrations_enabled: true,
  listings_enabled: true,
  payments_enabled: true,
  claims_enabled: true,
  maintenance_mode: false,
  maintenance_message: '',
  captcha_required: false,
  listings_require_approval: false,
  soft_launch_mode: false,
  circuit_breaker_triggered_at: null,
  circuit_breaker_cooldown_minutes: 15,
  created_at: '',
  updated_at: '',
}

// ─── In-memory cache (30s TTL) ─────────────────────────────────────

let cachedFlags: SystemFlags | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 30_000

export function invalidateFlagsCache() {
  cachedFlags = null
  cacheTimestamp = 0
}

// ─── getSystemFlags ─────────────────────────────────────────────────

export async function getSystemFlags(): Promise<SystemFlags> {
  const now = Date.now()
  if (cachedFlags && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedFlags
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('system_flags')
    .select('*')
    .eq('id', 1)
    .single()

  if (error || !data) {
    throw new Error(`Failed to load system flags: ${error?.message ?? 'no data'}`)
  }

  cachedFlags = data as unknown as SystemFlags
  cacheTimestamp = now
  return cachedFlags
}

/**
 * FAIL-OPEN wrapper: returns safe defaults if DB is unavailable.
 * Used by middleware and server actions.
 */
export async function getSystemFlagsSafe(): Promise<SystemFlags> {
  try {
    const flags = await getSystemFlags()
    // Soft launch mode forces listings_require_approval
    if (flags.soft_launch_mode) {
      return { ...flags, listings_require_approval: true }
    }
    return flags
  } catch (e) {
    console.error('Protection flags unavailable — fail open', e)
    return SAFE_DEFAULTS
  }
}

// ─── updateSystemFlag ───────────────────────────────────────────────

export async function updateSystemFlag(
  key: keyof SystemFlags,
  value: unknown
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('system_flags')
    .update({ [key]: value, updated_at: new Date().toISOString() } as any)
    .eq('id', 1)

  if (error) {
    return { success: false, error: error.message }
  }

  invalidateFlagsCache()
  return { success: true }
}

// ─── logAbuseEvent ──────────────────────────────────────────────────

export async function logAbuseEvent(
  eventType: AbuseEventType,
  ipAddress?: string | null,
  userId?: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase.from('abuse_events').insert({
      event_type: eventType,
      ip_address: ipAddress ?? null,
      user_id: userId ?? null,
      metadata: metadata ?? {},
    })

    // Check circuit breaker after logging
    await checkCircuitBreaker()
  } catch (e) {
    console.error('[protection] Failed to log abuse event:', e)
  }
}

// ─── checkCircuitBreaker ────────────────────────────────────────────

async function checkCircuitBreaker(): Promise<void> {
  try {
    const flags = await getSystemFlagsSafe()

    // Check cooldown — do NOT re-trigger during cooldown
    const cooldownMs = (flags.circuit_breaker_cooldown_minutes ?? 15) * 60 * 1000
    if (
      flags.circuit_breaker_triggered_at &&
      Date.now() - new Date(flags.circuit_breaker_triggered_at).getTime() < cooldownMs
    ) {
      return // cooldown active — skip silently
    }

    const supabase = createAdminClient()

    // Check thresholds
    const { data: failedRegCount } = await supabase.rpc('get_abuse_event_count', {
      p_event_type: 'failed_registration',
      p_minutes: 5,
    })
    const { data: rateLimitCount } = await supabase.rpc('get_abuse_event_count', {
      p_event_type: 'rate_limit_violation',
      p_minutes: 5,
    })
    const { data: captchaFailCount } = await supabase.rpc('get_abuse_event_count', {
      p_event_type: 'captcha_failure',
      p_minutes: 5,
    })

    const shouldTrigger =
      (Number(failedRegCount) > 50) ||
      (Number(rateLimitCount) > 100) ||
      (Number(captchaFailCount) > 50)

    if (!shouldTrigger) return

    // Trigger: disable registrations + record timestamp
    await supabase
      .from('system_flags')
      .update({
        registrations_enabled: false,
        circuit_breaker_triggered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', 1)

    invalidateFlagsCache()

    // Log audit event
    await logAudit(supabase, {
      action: 'circuit_breaker_triggered',
      entityType: 'system_flags',
      entityId: null,
      actorId: null,
      details: {
        failed_registrations: Number(failedRegCount),
        rate_limit_violations: Number(rateLimitCount),
        captcha_failures: Number(captchaFailCount),
      },
    })

    // Create system alert + notify admins (fire-and-forget)
    const reason = [
      Number(failedRegCount) > 50 ? `${failedRegCount} failed registrations` : null,
      Number(rateLimitCount) > 100 ? `${rateLimitCount} rate limit violations` : null,
      Number(captchaFailCount) > 50 ? `${captchaFailCount} captcha failures` : null,
    ].filter(Boolean).join(', ')

    createSystemAlert(
      'critical',
      'Circuit breaker triggered',
      `Auto-protection activated. Registrations disabled. Triggers: ${reason}`,
      'circuit_breaker',
      {
        failed_registrations: Number(failedRegCount),
        rate_limit_violations: Number(rateLimitCount),
        captcha_failures: Number(captchaFailCount),
      }
    ).catch((e) => console.error('[protection] Failed to create circuit breaker alert:', e))
  } catch (e) {
    console.error('[protection] Circuit breaker check failed:', e)
  }
}

// ─── resetCircuitBreaker (admin action) ─────────────────────────────

export async function resetCircuitBreaker(actorId: string): Promise<void> {
  const supabase = createAdminClient()

  await supabase
    .from('system_flags')
    .update({
      circuit_breaker_triggered_at: null,
      registrations_enabled: true,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', 1)

  invalidateFlagsCache()

  await logAudit(supabase, {
    action: 'protection_flag_changed',
    entityType: 'system_flags',
    entityId: null,
    actorId,
    details: { action: 'circuit_breaker_reset' },
  })
}

// ─── verifyCaptcha ──────────────────────────────────────────────────

export async function verifyCaptcha(token: string): Promise<{ success: boolean }> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    // No secret key configured — graceful skip
    return { success: true }
  }

  try {
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token }),
      }
    )
    const data = await response.json()
    return { success: Boolean(data.success) }
  } catch {
    return { success: false }
  }
}

// ─── requireEmailVerified ───────────────────────────────────────────

export function requireEmailVerified(user: { email_confirmed_at?: string | null }): void {
  if (!user.email_confirmed_at) {
    throw new Error('Please verify your email address before performing this action.')
  }
}

// ─── logPaymentEvent ────────────────────────────────────────────────

export async function logPaymentEvent(
  userId: string | null,
  stripeCustomerId: string | null,
  stripeSubscriptionId: string | null,
  eventType: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase.from('payment_events').insert({
      user_id: userId,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      event_type: eventType,
      metadata: metadata ?? {},
    })
  } catch (e) {
    console.error('[protection] Failed to log payment event:', e)
  }
}
