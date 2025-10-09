import { authMiddleware } from '@repo/auth/middleware';
import {
  noseconeMiddleware,
  noseconeOptions,
  noseconeOptionsWithToolbar,
} from '@repo/security/middleware';
import { type NextRequest, type NextFetchEvent, NextResponse } from 'next/server';
import { env } from './env';

// Create security headers function
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

  // Step 2: Apply security headers (AWAIT the response)
  const securityResponse = await securityHeaders();
  
  // Step 3: Merge auth response with security headers
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