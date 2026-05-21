import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // API routes — return 401, not redirect (so fetch() callers get a proper error)
  // /api/cron/run is excluded — it authenticates via CRON_SECRET header instead
  if (pathname.startsWith('/api/') && pathname !== '/api/cron/run') {
    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }
    return supabaseResponse
  }

  // Dashboard pages — redirect to login if no session
  if (pathname.startsWith('/dashboard')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  }

  // Login page — redirect to dashboard if already logged in
  if (pathname === '/login' && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

// Only run middleware on dashboard, API routes, and login
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/:path*',
    '/login',
  ],
}
