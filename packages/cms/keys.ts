import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const keys = () =>
  createEnv({
    server: {
      BASEHUB_TOKEN:
        process.env.VERCEL === '1'
          ? z.string().startsWith('bshb_pk_')
          : z.string().optional().default(''),
    },
    runtimeEnv: {
      BASEHUB_TOKEN: process.env.BASEHUB_TOKEN,
    },
  });
