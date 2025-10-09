import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest, type NextMiddleware } from 'next/server';

export const authMiddleware: NextMiddleware = async (req: NextRequest) => {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            req.cookies.set(name, value)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && req.nextUrl.pathname.startsWith('/dashboard')) {
    const url = req.nextUrl.clone();
    url.pathname = '/sign-in';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
};

export const config = {
  matcher: ['/dashboard/:path*'],
  runtime: 'nodejs', // บังคับใช้ Node runtime แทน Edge
};
