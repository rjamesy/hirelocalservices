import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getPlanById } from '@/lib/constants'
import { getUserEntitlements } from '@/lib/entitlements'
import { SettingsClient } from './SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get subscription details
  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .neq('status', 'canceled')
    .limit(1)
    .maybeSingle()

  // Also check for canceled but still active
  let activeSub = sub
  if (!activeSub) {
    const { data: canceledSub } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'canceled')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (canceledSub?.current_period_end) {
      const periodEnd = new Date(canceledSub.current_period_end)
      if (periodEnd > new Date()) {
        activeSub = canceledSub
      }
    }
  }

  const entitlements = await getUserEntitlements(supabase, user.id)

  // Build subscription info for client
  const planDef = entitlements.plan ? getPlanById(entitlements.plan) : null
  const subscriptionInfo = activeSub ? {
    planName: planDef?.name ?? 'Unknown',
    planTier: entitlements.plan,
    price: planDef?.price ?? 0,
    interval: planDef?.interval ?? 'month',
    status: activeSub.status as string,
    isTrial: entitlements.isTrial,
    trialEndsAt: activeSub.trial_ends_at ?? null,
    cancelAtPeriodEnd: activeSub.cancel_at_period_end ?? false,
    currentPeriodEnd: activeSub.current_period_end ?? null,
    subscribedAt: activeSub.subscribed_at ?? activeSub.current_period_start ?? null,
    planChangedAt: activeSub.plan_changed_at ?? null,
  } : null

  return (
    <SettingsClient
      email={user.email ?? ''}
      subscriptionInfo={subscriptionInfo}
    />
  )
}
