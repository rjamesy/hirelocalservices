'use server'

import { createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be logged in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    throw new Error('You must be an admin')
  }
  return { supabase, user }
}

export async function resetAllData(
  confirmPhrase: string,
  secondConfirm: boolean,
  dryRun: boolean = false,
  productionConfirm?: string
) {
  const { supabase } = await requireAdmin()

  // Client-side phrase validation
  if (confirmPhrase !== 'RESET ALL OPERATIONAL DATA') {
    return { error: 'Confirmation phrase does not match. Type "RESET ALL OPERATIONAL DATA" exactly.' }
  }

  if (!secondConfirm && !dryRun) {
    return { error: 'You must check the confirmation checkbox.' }
  }

  const { data, error } = await supabase.rpc('admin_reset_operational_data', {
    confirm_phrase: confirmPhrase,
    dry_run: dryRun,
    production_confirm: productionConfirm || null,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true, data }
}

export async function validateResetState() {
  const { supabase } = await requireAdmin()

  const checks: { label: string; expected: string; actual: number; passed: boolean }[] = []

  const queries = [
    { table: 'categories', label: 'Categories (reference)', expectGt0: true },
    { table: 'postcodes', label: 'Postcodes (reference)', expectGt0: true },
    { table: 'businesses', label: 'Businesses (operational)', expectGt0: false },
    { table: 'business_claims', label: 'Business Claims', expectGt0: false },
    { table: 'user_subscriptions', label: 'User Subscriptions', expectGt0: false },
    { table: 'seed_candidates', label: 'Seed Candidates', expectGt0: false },
    { table: 'seed_query_runs', label: 'Seed Query Runs', expectGt0: false },
    { table: 'seed_publish_runs', label: 'Seed Publish Runs', expectGt0: false },
  ] as const

  for (const q of queries) {
    const { count, error } = await supabase
      .from(q.table as any)
      .select('*', { count: 'exact', head: true })

    const actual = count ?? 0
    const passed = q.expectGt0 ? actual > 0 : actual === 0
    checks.push({
      label: q.label,
      expected: q.expectGt0 ? '> 0' : '= 0',
      actual,
      passed,
    })

    if (error) {
      checks[checks.length - 1] = {
        label: q.label,
        expected: q.expectGt0 ? '> 0' : '= 0',
        actual: -1,
        passed: false,
      }
    }
  }

  return {
    checks,
    allPassed: checks.every((c) => c.passed),
  }
}

export async function toggleResetFlag(enabled: boolean) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from('system_flags')
    .update({ allow_operational_reset: enabled } as any)
    .eq('id', 1)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function isProductionEnvironment() {
  const { supabase } = await requireAdmin()

  const { data, error } = await supabase
    .from('system_flags')
    .select('production_environment' as any)
    .limit(1)
    .single()

  if (error) {
    return { isProduction: false, error: error.message }
  }

  return { isProduction: Boolean((data as any)?.production_environment) }
}

export async function getResetFlag() {
  const { supabase } = await requireAdmin()

  const { data, error } = await supabase
    .from('system_flags')
    .select('allow_operational_reset' as any)
    .limit(1)
    .single()

  if (error) {
    return { enabled: false, error: error.message }
  }

  return { enabled: Boolean((data as any)?.allow_operational_reset) }
}
