'use server'

import { getSystemFlagsSafe, verifyCaptcha, logAbuseEvent } from '@/lib/protection'
import { checkRateLimit, registrationLimiter, loginLimiter } from '@/lib/rate-limiter'
import { getClientIp } from '@/lib/ip'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Pre-signup check. Client calls this BEFORE supabase.auth.signUp().
 * Enforces: registrations_enabled flag, rate limit, captcha, email blacklist.
 */
export async function checkRegistrationAllowed(
  email?: string,
  captchaToken?: string
): Promise<{ allowed: boolean; error?: string }> {
  try {
    const flags = await getSystemFlagsSafe()

    // Check registrations enabled
    if (!flags.registrations_enabled) {
      return { allowed: false, error: 'Registrations are currently disabled. Please try again later.' }
    }

    // Rate limit by IP
    const ip = await getClientIp()
    try {
      await checkRateLimit(registrationLimiter, `register:${ip}`, 'failed_registration')
    } catch {
      return { allowed: false, error: 'Too many registration attempts. Please try again later.' }
    }

    // Captcha verification
    if (flags.captcha_required && captchaToken) {
      const captchaResult = await verifyCaptcha(captchaToken)
      if (!captchaResult.success) {
        await logAbuseEvent('captcha_failure', ip, null, { context: 'registration' })
        return { allowed: false, error: 'Captcha verification failed. Please try again.' }
      }
    } else if (flags.captcha_required && !captchaToken) {
      return { allowed: false, error: 'Please complete the captcha verification.' }
    }

    // Check email blacklist — blocks re-registration by deleted/suspended accounts
    if (email) {
      try {
        const adminSupabase = createAdminClient()
        const { data: blResult } = await adminSupabase.rpc('is_blacklisted', {
          p_value: email.toLowerCase(),
          p_field_type: 'email',
        })
        const row = Array.isArray(blResult) ? blResult[0] : blResult
        if (row?.is_blocked) {
          return { allowed: false, error: 'This email address cannot be used for registration.' }
        }
      } catch {
        // Fail open on blacklist check error — don't block legitimate registrations
      }
    }

    return { allowed: true }
  } catch {
    // Fail open — allow registration if protection check fails
    return { allowed: true }
  }
}

/**
 * Pre-login check. Client calls this BEFORE supabase.auth.signInWithPassword().
 * Enforces: rate limit, captcha.
 */
export async function checkLoginAllowed(
  captchaToken?: string
): Promise<{ allowed: boolean; error?: string; captchaRequired?: boolean }> {
  try {
    const flags = await getSystemFlagsSafe()
    const ip = await getClientIp()

    // Rate limit by IP
    try {
      await checkRateLimit(loginLimiter, `login:${ip}`, 'rate_limit_violation')
    } catch {
      return { allowed: false, error: 'Too many login attempts. Please try again later.' }
    }

    // Captcha verification
    if (flags.captcha_required && captchaToken) {
      const captchaResult = await verifyCaptcha(captchaToken)
      if (!captchaResult.success) {
        await logAbuseEvent('captcha_failure', ip, null, { context: 'login' })
        return { allowed: false, error: 'Captcha verification failed. Please try again.' }
      }
    } else if (flags.captcha_required && !captchaToken) {
      return { allowed: false, error: 'Please complete the captcha verification.' }
    }

    return { allowed: true }
  } catch {
    // Fail open — allow login if protection check fails
    return { allowed: true }
  }
}
