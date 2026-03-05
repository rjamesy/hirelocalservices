'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { stripe } from '@/lib/stripe'
import log from '@/lib/logger'

/**
 * changePassword — update the current user's password.
 * Requires the user to be authenticated.
 */
export async function changePassword(newPassword: string): Promise<{ success?: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 8) {
    return { error: 'Password must be at least 8 characters.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated.' }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

/**
 * requestPasswordReset — send a password reset email via Supabase Auth.
 */
export async function requestPasswordReset(email: string): Promise<{ success?: boolean; error?: string }> {
  if (!email || !email.includes('@')) {
    return { error: 'Please enter a valid email address.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/reset-password`,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

// ─── Blacklist normalization helpers ────────────────────────────────

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

function normalizeWebsite(website: string): string {
  return website
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
}

function normalizeAbnAcn(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * deleteMyAccount — self-service account deletion.
 *
 * Steps:
 * 1. Cancel Stripe subscription (if any)
 * 2. Soft-delete all published listings (P)
 * 3. Hard-delete all working listings (W)
 * 4. Blacklist user identifiers (email, phone, website, ABN/ACN)
 * 5. Suspend profile
 * 6. Log audit event
 * 7. Sign out
 */
export async function deleteMyAccount(): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated.' }
  }

  const now = new Date().toISOString()

  // 1. Cancel Stripe subscription if active
  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('stripe_subscription_id, stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (sub?.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id)
    } catch (err) {
      log.error({ error: err }, 'Failed to cancel Stripe subscription during account deletion')
      // Continue with deletion — subscription will expire naturally
    }
  }

  // 2. Fetch all user's non-seed businesses with their contact info
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, slug, status, phone, email_contact, website, abn')
    .eq('owner_id', user.id)
    .eq('is_seed', false)

  // Collect identifiers for blacklisting
  type BlacklistFieldType = 'business_name' | 'email' | 'phone' | 'website' | 'abn' | 'acn'
  const identifiersToBlacklist: { term: string; field_type: BlacklistFieldType }[] = []

  // Always blacklist the user's email
  if (user.email) {
    identifiersToBlacklist.push({ term: user.email.toLowerCase(), field_type: 'email' })
  }

  for (const biz of businesses ?? []) {
    // Collect identifiers from each business
    if (biz.phone) {
      const normalized = normalizePhone(biz.phone)
      if (normalized.length >= 8) {
        identifiersToBlacklist.push({ term: normalized, field_type: 'phone' })
      }
    }
    if (biz.website) {
      const normalized = normalizeWebsite(biz.website)
      if (normalized.length > 0) {
        identifiersToBlacklist.push({ term: normalized, field_type: 'website' })
      }
    }
    if (biz.abn) {
      const normalized = normalizeAbnAcn(biz.abn)
      if (normalized.length >= 9) {
        identifiersToBlacklist.push({ term: normalized, field_type: 'abn' })
      }
    }

    // Soft-delete published listings (set status='deleted')
    await supabase
      .from('businesses')
      .update({ status: 'deleted', deleted_at: now })
      .eq('id', biz.id)

    // Remove from search index
    await supabase.rpc('refresh_search_index', { p_business_id: biz.id })

    // Hard-delete working listings
    await supabase
      .from('working_listings')
      .delete()
      .eq('business_id', biz.id)
  }

  // 4. Suspend profile (must happen before blacklist RPC which validates suspended_at)
  await supabase
    .from('profiles')
    .update({
      suspended_at: now,
      suspended_reason: 'Account self-deleted',
    })
    .eq('id', user.id)

  // 5. Blacklist identifiers via SECURITY DEFINER RPC (bypasses admin-only RLS)
  if (identifiersToBlacklist.length > 0) {
    await supabase.rpc('blacklist_on_delete', {
      p_identifiers: identifiersToBlacklist.map(({ term, field_type }) => ({ term, field_type })),
    })
  }

  // 6. Log audit event
  await supabase.rpc('insert_audit_log', {
    p_action: 'account_deleted',
    p_entity_type: 'account',
    p_entity_id: user.id,
    p_actor_id: user.id,
    p_details: {
      reason: 'Self-service deletion',
      businesses_deleted: (businesses ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        previous_status: b.status,
      })),
      identifiers_blacklisted: identifiersToBlacklist.map(i => i.field_type),
    },
  })

  // 7. Sign out
  await supabase.auth.signOut()

  revalidatePath('/')
  return { success: true }
}
