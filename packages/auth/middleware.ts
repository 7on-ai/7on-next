import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';

// ลบ type NextMiddleware ออก เพราะมันต้องการ 2 parameters
export async function authMiddleware(
  req: NextRequest,
  event?: NextFetchEvent  // เพิ่ม parameter ที่ 2 (optional)
) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
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
}

// ลบ config ออกจาก package layer (ย้ายไป app layer แล้ว)