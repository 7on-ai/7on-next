import { authMiddleware } from '@repo/auth/middleware';
import {
  noseconeMiddleware,
  noseconeOptions,
  noseconeOptionsWithToolbar,
} from '@repo/security/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from './env';

// Middleware function that combines auth + security headers
export default async function middleware(req: NextRequest) {
  // Step 1: Run auth middleware (handles Supabase auth)
  const authResponse = await authMiddleware(req);
  
  // If auth middleware returns a redirect/response, return it immediately
  if (authResponse && authResponse.status !== 200) {
    return authResponse;
  }

  // Step 2: Apply security headers
  const securityHeaders = env.FLAGS_SECRET
    ? noseconeMiddleware(noseconeOptionsWithToolbar)
    : noseconeMiddleware(noseconeOptions);

  // Get security headers response
  const secResponse = await securityHeaders(req, NextResponse.next());
  
  return secResponse;
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
  // CRITICAL: Use Node.js runtime for Supabase compatibility
  runtime: 'nodejs',
};