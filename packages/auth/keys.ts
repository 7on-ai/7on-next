import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const keys = () =>
  createEnv({
    server: {
      CLERK_SECRET_KEY:
        process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
          ? z.string().startsWith('sk_')
          : z.string().optional().default('sk_test_dummy'),
      CLERK_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
    },
    client: {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
          ? z.string().startsWith('pk_')
          : z.string().optional().default('pk_test_dummy'),
      NEXT_PUBLIC_CLERK_SIGN_IN_URL:
        process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
          ? z.string().startsWith('/')
          : z.string().optional().default('/sign-in'),
      NEXT_PUBLIC_CLERK_SIGN_UP_URL:
        process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
          ? z.string().startsWith('/')
          : z.string().optional().default('/sign-up'),
      NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL:
        process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
          ? z.string().startsWith('/')
          : z.string().optional().default('/'),
      NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL:
        process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
          ? z.string().startsWith('/')
          : z.string().optional().default('/'),
    },
    runtimeEnv: {
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
      CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
      NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
      NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL:
        process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL,
      NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL:
        process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL,
    },
  });
