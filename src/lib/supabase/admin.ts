import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'

/**
 * Admin Supabase client that bypasses Row Level Security.
 * Only use on the server side for admin operations.
 * Never expose the service role key to the client.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
