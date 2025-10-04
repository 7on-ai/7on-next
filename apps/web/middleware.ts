import { env } from '@/env';
// import { authMiddleware } from '@repo/auth/middleware';
import { internationalizationMiddleware } from '@repo/internationalization/middleware';
// import { parseError } from '@repo/observability/error';
// import { secure } from '@repo/security';
import {
  // noseconeMiddleware,
  // noseconeOptions,
  // noseconeOptionsWithToolbar,
} from '@repo/security/middleware';
import {
  type NextMiddleware,
  type NextRequest,
  NextResponse,
} from 'next/server';

export const config = {
  // matcher tells Next.js which routes to run the middleware on. This runs the
  // middleware on all routes except for static assets and Posthog ingest
  matcher: ['/((?!_next/static|_next/image|ingest|favicon.ico).*)'],
};

// Simplified middleware - only i18n
const middleware = ((request: NextRequest) => {
  const i18nResponse = internationalizationMiddleware(request);
  
  if (i18nResponse) {
    return i18nResponse;
  }

  return NextResponse.next();
}) as NextMiddleware;

export default middleware;
