import { createClient } from '@supabase/supabase-js'

const s = createClient(
  'https://hqaeezfsetzyubcmbwbv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxYWVlemZzZXR6eXViY21id2J2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc0MTgwNSwiZXhwIjoyMDg3MzE3ODA1fQ.71vuh44vFJJJsWZ4Ucsw8Fl8u9CYiTNpyO7krWURC4A'
)

async function run() {
  const { data: bizs } = await s
    .from('businesses')
    .select('id')
    .ilike('description', '%e2e-pending-test%')

  if (!bizs || bizs.length === 0) {
    console.log('No leftover test data')
    return
  }

  const ids = bizs.map((b) => b.id)
  console.log('Cleaning', ids.length, 'businesses')

  await s.from('photos').delete().in('business_id', ids)
  await s.from('testimonials').delete().in('business_id', ids)
  await s.from('business_locations').delete().in('business_id', ids)
  await s.from('subscriptions').delete().in('business_id', ids)
  await s.from('verification_jobs').delete().in('business_id', ids)
  await s.from('businesses').delete().in('id', ids)
  console.log('Done')
}

run()
