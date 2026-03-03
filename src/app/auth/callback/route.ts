import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Validate redirect target — only allow safe relative paths to prevent open redirect
  const rawNext = searchParams.get('next') ?? '/dashboard'
  const isSafePath = rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes('\\') && !/[\x00-\x1f]/.test(rawNext)
  const next = isSafePath ? rawNext : '/dashboard'

  if (code) {
    const supabase = await createClient()

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Check if a profile already exists for this user
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle()

      // If no profile exists, create one with default 'business' role.
      // This handles cases where the DB trigger may not have fired yet
      // or was not set up.
      if (!existingProfile) {
        await supabase.from('profiles').insert({
          id: data.user.id,
          email: data.user.email ?? '',
          role: 'business' as const,
        })
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // If code exchange fails, redirect to login with an error hint
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
