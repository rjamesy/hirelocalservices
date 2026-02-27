/**
 * Twilio SMS OTP for claim verification.
 *
 * Sends a 6-digit code to a phone number and verifies it.
 * Falls back gracefully if Twilio is not configured.
 */

import { createAdminClient } from '@/lib/supabase/admin'

const OTP_EXPIRY_MINUTES = 10
const MAX_ATTEMPTS = 3
const MAX_RESENDS = 3

function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromPhone = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromPhone) {
    return null
  }
  return { accountSid, authToken, fromPhone }
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

/**
 * Send an OTP code to the given phone number.
 * Returns the OTP verification record ID or null if Twilio is not configured.
 */
export async function sendOTP(
  userId: string,
  phone: string
): Promise<{ id: string | null; error: string | null; skipped: boolean }> {
  const config = getTwilioConfig()

  if (!config) {
    console.warn('[OTP] Twilio not configured — skipping OTP verification')
    return { id: null, error: null, skipped: true }
  }

  // Rate limit: check recent OTPs for this user
  const supabase = createAdminClient()
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('otp_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', fiveMinAgo)

  if ((count ?? 0) >= MAX_RESENDS) {
    return { id: null, error: 'Too many verification attempts. Please try again later.', skipped: false }
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString()

  // Store in DB
  const { data: otp, error: dbError } = await supabase
    .from('otp_verifications')
    .insert({
      user_id: userId,
      phone,
      code,
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (dbError) {
    console.error('[OTP] DB insert error:', dbError.message)
    return { id: null, error: 'Failed to create verification code.', skipped: false }
  }

  // Send via Twilio
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`
    const body = new URLSearchParams({
      To: phone,
      From: config.fromPhone,
      Body: `Your HireLocalServices verification code is: ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
    })

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    if (!resp.ok) {
      const text = await resp.text()
      console.error('[OTP] Twilio error:', text)
      return { id: null, error: 'Failed to send verification code. Please try again.', skipped: false }
    }
  } catch (err: any) {
    console.error('[OTP] Twilio send error:', err.message)
    return { id: null, error: 'Failed to send verification code. Please try again.', skipped: false }
  }

  return { id: otp.id, error: null, skipped: false }
}

/**
 * Verify an OTP code.
 * Returns success/failure and marks the OTP as verified.
 */
export async function verifyOTP(
  userId: string,
  phone: string,
  code: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = createAdminClient()

  // Get the most recent unverified OTP for this user + phone
  const { data: otp, error: fetchError } = await supabase
    .from('otp_verifications')
    .select('*')
    .eq('user_id', userId)
    .eq('phone', phone)
    .is('verified_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fetchError || !otp) {
    return { success: false, error: 'No pending verification found. Please request a new code.' }
  }

  // Check expiry
  if (new Date(otp.expires_at) < new Date()) {
    return { success: false, error: 'Verification code has expired. Please request a new code.' }
  }

  // Check max attempts
  if (otp.attempts >= MAX_ATTEMPTS) {
    return { success: false, error: 'Too many incorrect attempts. Please request a new code.' }
  }

  // Increment attempts
  await supabase
    .from('otp_verifications')
    .update({ attempts: otp.attempts + 1 })
    .eq('id', otp.id)

  // Check code
  if (otp.code !== code) {
    const remaining = MAX_ATTEMPTS - otp.attempts - 1
    return {
      success: false,
      error: remaining > 0
        ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : 'Too many incorrect attempts. Please request a new code.',
    }
  }

  // Mark as verified
  await supabase
    .from('otp_verifications')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', otp.id)

  return { success: true, error: null }
}

/**
 * Check if Twilio is configured.
 */
export function isTwilioConfigured(): boolean {
  return getTwilioConfig() !== null
}
