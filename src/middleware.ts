import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { getSystemFlagsSafe } from '@/lib/protection'

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user, supabase } = await updateSession(request)
  const { pathname } = request.nextUrl

  // ── ABSOLUTE BYPASS: Admin routes skip ALL protection ─────────────
  // This is the FIRST check — runs BEFORE any flag loading.
  // Without this, admin could be permanently locked out.
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    // Skip ALL protection logic — fall through to existing admin auth/role checks only
  }
  // ── Maintenance mode check (non-admin routes only) ────────────────
  else if (
    !pathname.startsWith('/api/stripe/webhook') &&
    !pathname.startsWith('/_next') &&
    !pathname.startsWith('/favicon') &&
    !pathname.startsWith('/maintenance')
  ) {
    const flags = await getSystemFlagsSafe()
    if (flags.maintenance_mode) {
      const url = request.nextUrl.clone()
      url.pathname = '/maintenance'
      return NextResponse.rewrite(url)
    }
  }

  // ── Protect /dashboard/* routes ───────────────────────────────────
  if (pathname.startsWith('/dashboard')) {
    if (!user) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // ── Protect /admin/* routes ───────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (!user) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Check admin role from the profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      const homeUrl = request.nextUrl.clone()
      homeUrl.pathname = '/'
      return NextResponse.redirect(homeUrl)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Public assets (images, svgs, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
