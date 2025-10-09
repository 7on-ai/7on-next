import { authMiddleware } from '@repo/auth/middleware';
import {
  noseconeMiddleware,
  noseconeOptions,
  noseconeOptionsWithToolbar,
} from '@repo/security/middleware';
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { env } from './env';

// เพิ่ม NextFetchEvent parameter ตามที่ Next.js 15 ต้องการ
export default async function middleware(
  req: NextRequest,
  event: NextFetchEvent  // เพิ่ม parameter ที่ 2
) {
  // Step 1: Run auth middleware
  const authResponse = await authMiddleware(req, event);
  
  // If auth returns redirect, use it immediately
  if (authResponse.status !== 200) {
    return authResponse;
  }

  // Step 2: Apply security headers
  const securityHeadersFn = env.FLAGS_SECRET
    ? noseconeMiddleware(noseconeOptionsWithToolbar)
    : noseconeMiddleware(noseconeOptions);

  return securityHeadersFn(req, authResponse);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
  runtime: 'nodejs',
};