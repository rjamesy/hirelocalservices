import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserEntitlements } from '@/lib/entitlements'
import { getBusinessMetrics } from '@/app/actions/metrics'
import MetricsClient from './MetricsClient'

export default async function MetricsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const entitlements = await getUserEntitlements(supabase, user.id)

  if (!entitlements.canViewMetrics) {
    redirect('/dashboard')
  }

  // Fetch user's non-seed, non-deleted businesses
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, slug')
    .eq('owner_id', user.id)
    .eq('is_seed', false)
    .is('deleted_at', null)

  const bizList = businesses ?? []

  // Fetch initial metrics for the first business (30 days)
  const initialMetrics = bizList.length > 0
    ? await getBusinessMetrics(bizList[0].id, 30)
    : null

  return (
    <MetricsClient
      businesses={bizList}
      initialMetrics={initialMetrics}
    />
  )
}
