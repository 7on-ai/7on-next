import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest, type NextMiddleware } from 'next/server';

// สำหรับ Next.js 15 เราสามารถ export default middleware function
export const authMiddleware: NextMiddleware = async (req: NextRequest) => {
  // สร้าง Supabase client สำหรับ server-side
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

  // ดึง user จาก Supabase
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ถ้าเข้าหน้า /dashboard แต่ยังไม่ได้ login ให้ redirect ไป sign-in
  if (!user && req.nextUrl.pathname.startsWith('/dashboard')) {
    const url = req.nextUrl.clone();
    url.pathname = '/sign-in';
    return NextResponse.redirect(url);
  }

  // ถ้า auth ผ่าน ให้ไปต่อ
  return NextResponse.next();
};

// บังคับให้ middleware รันใน Node.js runtime
export const config = {
  matcher: ['/dashboard/:path*'], // รันเฉพาะ route ที่ต้อง auth
  runtime: 'nodejs',
};
