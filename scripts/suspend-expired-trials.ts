/**
 * suspend-expired-trials.ts
 *
 * Cron script that suspends expired free trial users.
 * Finds user_subscriptions with plan='free_trial', trial_ends_at < now(), status='active'
 * and sets them to 'canceled', then billing_suspends all their businesses.
 *
 * Usage:
 *   npx tsx scripts/suspend-expired-trials.ts
 *
 * EC2 cron:
 *   0 2 * * * cd /home/ubuntu/app && npx tsx scripts/suspend-expired-trials.ts >> /var/log/trial-cron.log 2>&1
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load .env.local
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log(`[${new Date().toISOString()}] Starting trial expiration check...`)

  // Find expired free trial subscriptions that are still active
  const { data: expiredTrials, error } = await supabase
    .from('user_subscriptions')
    .select('id, user_id, trial_ends_at')
    .eq('plan', 'free_trial')
    .eq('status', 'active')
    .lt('trial_ends_at', new Date().toISOString())

  if (error) {
    console.error('Failed to query expired trials:', error)
    process.exit(1)
  }

  if (!expiredTrials || expiredTrials.length === 0) {
    console.log('No expired trials found.')
    return
  }

  console.log(`Found ${expiredTrials.length} expired trial(s).`)

  let suspended = 0

  for (const trial of expiredTrials) {
    // 1. Set user_subscription status to canceled
    const { error: subError } = await supabase
      .from('user_subscriptions')
      .update({ status: 'canceled' })
      .eq('id', trial.id)

    if (subError) {
      console.error(`Failed to cancel subscription for user ${trial.user_id}:`, subError)
      continue
    }

    // 2. Set billing_status='billing_suspended' on all user's businesses
    const { data: businesses, error: bizError } = await supabase
      .from('businesses')
      .update({ billing_status: 'billing_suspended' })
      .eq('owner_id', trial.user_id)
      .eq('is_seed', false)
      .select('id')

    if (bizError) {
      console.error(`Failed to suspend businesses for user ${trial.user_id}:`, bizError)
      continue
    }

    // 3. Refresh search index for each affected business
    for (const biz of businesses ?? []) {
      await supabase.rpc('refresh_search_index', { p_business_id: biz.id })
    }

    suspended++
    console.log(
      `Suspended user ${trial.user_id}: ${(businesses ?? []).length} business(es) affected`
    )
  }

  console.log(
    `[${new Date().toISOString()}] Done. Suspended ${suspended}/${expiredTrials.length} expired trial(s).`
  )
}

main().catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
