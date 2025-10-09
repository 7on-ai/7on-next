import { authMiddleware } from '@repo/auth/middleware';
import {
  noseconeMiddleware,
  noseconeOptions,
  noseconeOptionsWithToolbar,
} from '@repo/security/middleware';
import { type NextRequest, type NextFetchEvent, NextResponse } from 'next/server';
import { env } from './env';

// Create security headers function (same pattern as original)
const securityHeaders = env.FLAGS_SECRET
  ? noseconeMiddleware(noseconeOptionsWithToolbar)
  : noseconeMiddleware(noseconeOptions);

export default async function middleware(
  req: NextRequest,
  event: NextFetchEvent
) {
  // Step 1: Run auth check
  const authResponse = await authMiddleware(req, event);
  
  // If auth fails (redirect or error), return immediately
  if (authResponse.status !== 200) {
    return authResponse;
  }

  // Step 2: Apply security headers
  // Call securityHeaders() without arguments (same as Clerk pattern)
  // Note: This works because nosecone reads request from Next.js context
  const securityResponse = securityHeaders();
  
  // Merge auth response with security headers
  // Copy all headers from security response to auth response
  const response = NextResponse.next();
  securityResponse.headers.forEach((value, key) => {
    response.headers.set(key, value);
  });
  
  return response;
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
  runtime: 'nodejs',
};