// apps/app/app/api/user/social-credentials/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@repo/auth/server';
import { database } from '@repo/database';

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await database.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const credentials = await database.socialCredential.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        provider: true,
        providerUserId: true,
        injectedToN8n: true,
        injectedAt: true,
        injectionError: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        tokenSource: true,
      },
    });

    return NextResponse.json(credentials);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}