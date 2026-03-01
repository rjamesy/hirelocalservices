import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { getSystemFlagsSafe } from '@/lib/protection'

// Paths that always pass through, even during maintenance / soft-launch
const PASSTHROUGH_PREFIXES = [
  '/api/stripe/webhook',
  '/_next',
  '/favicon',
  '/maintenance',
  '/coming-soon',
  '/login',
  '/signup',
  '/logout',
  '/auth',
  '/api/auth',
  '/api/',
]

function isPassthroughPath(pathname: string) {
  return PASSTHROUGH_PREFIXES.some((p) => pathname.startsWith(p))
}

// Paths accessible to authenticated users during soft-launch
const SOFT_LAUNCH_AUTH_PREFIXES = ['/dashboard', '/admin']

function isSoftLaunchAuthPath(pathname: string) {
  return SOFT_LAUNCH_AUTH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user, supabase } = await updateSession(request)
  const { pathname } = request.nextUrl

  // ── ABSOLUTE BYPASS: Admin routes skip ALL protection ─────────────
  // This is the FIRST check — runs BEFORE any flag loading.
  // Without this, admin could be permanently locked out.
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    // Skip ALL protection logic — fall through to existing admin auth/role checks only
  }
  // ── Maintenance / soft-launch checks (non-passthrough routes only) ──
  else if (!isPassthroughPath(pathname)) {
    const flags = await getSystemFlagsSafe()

    // ── Maintenance mode (full lockout except admins) ──────────────
    if (flags.maintenance_mode) {
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile?.role === 'admin') {
          supabaseResponse.headers.set('x-maintenance-active', 'true')
        } else {
          const url = request.nextUrl.clone()
          url.pathname = '/maintenance'
          return NextResponse.rewrite(url)
        }
      } else {
        const url = request.nextUrl.clone()
        url.pathname = '/maintenance'
        return NextResponse.rewrite(url)
      }
    }

    // ── Soft launch mode (gate public pages) ──────────────────────
    if (flags.soft_launch_mode) {
      supabaseResponse.headers.set('x-soft-launch', 'true')

      // Check bypass token (cookie or query param)
      let bypassed = false
      const bypassToken = process.env.SOFT_LAUNCH_BYPASS_TOKEN
      if (bypassToken) {
        const cookieBypass = request.cookies.get('soft_launch_bypass')?.value
        const queryBypass = request.nextUrl.searchParams.get('bypass')

        if (cookieBypass === bypassToken) {
          bypassed = true
        } else if (queryBypass === bypassToken) {
          // Set cookie so future requests pass through automatically
          supabaseResponse.cookies.set('soft_launch_bypass', bypassToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30, // 30 days
          })
          bypassed = true
        }
      }

      // Gate all public pages → coming-soon (unless bypassed or on auth path)
      if (!bypassed && !isSoftLaunchAuthPath(pathname)) {
        const url = request.nextUrl.clone()
        url.pathname = '/coming-soon'
        return NextResponse.rewrite(url)
      }
    }
  }

  // ── Dashboard/Admin routes: set header so root layout can skip banners ──
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) {
    supabaseResponse.headers.set('x-is-dashboard', 'true')
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
