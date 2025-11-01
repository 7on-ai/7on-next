// apps/app/app/api/user/n8n-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { database as db } from '@repo/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        n8nUrl: true,
        n8nUserEmail: true,
        northflankProjectId: true,
        northflankProjectName: true,
        northflankProjectStatus: true,
        templateCompletedAt: true,
        n8nSetupError: true,
        // 🆕 เพิ่ม Postgres fields
        postgresSchemaInitialized: true,
        n8nPostgresCredentialId: true,
        postgresSetupError: true,
        postgresSetupAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const injectedProviders = await db.socialCredential.count({
      where: { userId: userId, injectedToN8n: true },
    });

    const totalProviders = await db.socialCredential.count({
      where: { userId: userId },
    });

    return NextResponse.json({
      n8n_ready: user.northflankProjectStatus === 'ready' && !!user.n8nUrl,
      n8n_url: user.n8nUrl,
      n8n_user_email: user.n8nUserEmail,
      northflank_project_id: user.northflankProjectId,
      northflank_project_name: user.northflankProjectName,
      northflank_project_status: user.northflankProjectStatus,
      template_completed_at: user.templateCompletedAt,
      injected_providers_count: injectedProviders,
      social_providers_count: totalProviders,
      setup_error: user.n8nSetupError,
      // 🆕 Postgres status
      postgres_schema_initialized: user.postgresSchemaInitialized,
      n8n_postgres_credential_id: user.n8nPostgresCredentialId,
      postgres_setup_error: user.postgresSetupError,
      postgres_setup_at: user.postgresSetupAt,
    });
  } catch (error) {
    console.error('Error fetching N8N status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}