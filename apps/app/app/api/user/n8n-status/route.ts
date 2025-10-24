// apps/app/app/api/user/n8n-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@repo/auth/server';
import { database } from '@repo/database';

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ✅ ใช้ @repo/database
    const user = await database.user.findUnique({
      where: { clerkId: clerkUserId },
      select: {
        id: true,
        n8nUrl: true,
        northflankProjectStatus: true,
        northflankProjectId: true,
        northflankProjectName: true,
        n8nApiKey: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const injectedCount = await database.socialCredential.count({
      where: { userId: user.id, injectedToN8n: true },
    });

    const totalCount = await database.socialCredential.count({
      where: { userId: user.id },
    });

    return NextResponse.json({
      n8n_ready: user.northflankProjectStatus === 'ready' && !!user.n8nUrl,
      n8n_url: user.n8nUrl,
      project_status: user.northflankProjectStatus,
      project_id: user.northflankProjectId,
      project_name: user.northflankProjectName,
      injected_providers_count: injectedCount,
      social_providers_count: totalCount,
      has_api_key: !!user.n8nApiKey,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}