// lib/db.ts - Prisma Client Setup
import { PrismaClient } from '@/generated/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

// ===== ENVIRONMENT VARIABLES =====
// Create .env.local file with these variables:

/*
# Database
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"

# App
NEXT_PUBLIC_APP_URL="https://your-app.vercel.app"

# Auth0
NEXT_PUBLIC_AUTH0_DOMAIN="connect.7on.ai"
AUTH0_M2M_CLIENT_ID="your_m2m_client_id"
AUTH0_M2M_CLIENT_SECRET="your_m2m_client_secret"

# Auth0 Provider Client IDs (Public)
NEXT_PUBLIC_AUTH0_GOOGLE_CLIENT_ID="your_google_client_id"
NEXT_PUBLIC_AUTH0_SPOTIFY_CLIENT_ID="your_spotify_client_id"
NEXT_PUBLIC_AUTH0_DISCORD_CLIENT_ID="your_discord_client_id"
NEXT_PUBLIC_AUTH0_GITHUB_CLIENT_ID="your_github_client_id"
NEXT_PUBLIC_AUTH0_LINKEDIN_CLIENT_ID="your_linkedin_client_id"

# Auth0 Provider Client Secrets (Private - Server only)
AUTH0_GOOGLE_CLIENT_SECRET="your_google_secret"
AUTH0_SPOTIFY_CLIENT_SECRET="your_spotify_secret"
AUTH0_DISCORD_CLIENT_SECRET="your_discord_secret"
AUTH0_GITHUB_CLIENT_SECRET="your_github_secret"
AUTH0_LINKEDIN_CLIENT_SECRET="your_linkedin_secret"

# Google OAuth (for N8N credentials)
GOOGLE_OAUTH_CLIENT_ID="your_google_oauth_client_id"
GOOGLE_OAUTH_CLIENT_SECRET="your_google_oauth_client_secret"

# Northflank
NORTHFLANK_API_TOKEN="your_northflank_token"

# Webhook (optional)
WEBHOOK_URL="https://your-app.vercel.app/api/setup-webhook"
WEBHOOK_AUTH_TOKEN="your_webhook_secret_token"
*/