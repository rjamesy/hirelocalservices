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
    !pathname.startsWith('/maintenance') &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/auth') &&
    !pathname.startsWith('/api/auth')
  ) {
    const flags = await getSystemFlagsSafe()
    if (flags.maintenance_mode) {
      // Allow admins to preview public pages with a banner
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile?.role === 'admin') {
          supabaseResponse.headers.set('x-maintenance-active', 'true')
          // Fall through — admin sees the page normally (banner shown in layout)
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

    // Soft launch mode banner header (for all users)
    if (flags.soft_launch_mode) {
      supabaseResponse.headers.set('x-soft-launch', 'true')
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
