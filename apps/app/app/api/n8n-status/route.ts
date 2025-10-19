// app/api/user/n8n-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    // Get user N8N info
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        n8nUrl: true,
        northflankProjectStatus: true,
      },
    });

    // Get social credentials count
    const [injectedCount, totalCount] = await Promise.all([
      db.socialCredential.count({
        where: {
          userId,
          injectedToN8n: true,
        },
      }),
      db.socialCredential.count({
        where: { userId },
      }),
    ]);

    const n8nReady = user?.northflankProjectStatus === 'ready' && !!user?.n8nUrl;

    return NextResponse.json({
      n8n_ready: n8nReady,
      n8n_url: user?.n8nUrl,
      project_status: user?.northflankProjectStatus,
      injected_providers_count: injectedCount,
      social_providers_count: totalCount,
    });
  } catch (error) {
    console.error('Error fetching N8N status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}