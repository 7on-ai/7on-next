import { auth } from '@repo/auth/server';
import { log } from '@repo/observability/log';
import { NextResponse } from 'next/server';

interface SessionTokenRequest {
  providerConfigKey: string;
  connectionId?: string;
  params?: Record<string, string>;
}

interface SessionTokenResponse {
  token: string;
  expiresAt: string;
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as SessionTokenRequest;
    const { providerConfigKey, connectionId, params } = body;

    if (!providerConfigKey) {
      return NextResponse.json(
        { error: 'providerConfigKey is required' },
        { status: 400 }
      );
    }

    const nangoSecretKey = process.env.NANGO_SECRET_KEY;
    if (!nangoSecretKey) {
      log.error('NANGO_SECRET_KEY not configured');
      return NextResponse.json(
        { error: 'Nango not configured' },
        { status: 500 }
      );
    }

    const nangoResponse = await fetch(
      'https://api.nango.dev/api/v1/connect/sessions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${nangoSecretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          end_user_id: connectionId || userId,
          allowed_integrations: [{ provider_config_key: providerConfigKey }],
          ...(params && { params }),
        }),
      }
    );

    if (!nangoResponse.ok) {
      const errorData = await nangoResponse.json();
      log.error('Nango session creation failed', { error: errorData });
      return NextResponse.json(
        { error: errorData.message || 'Failed to create session token' },
        { status: nangoResponse.status }
      );
    }

    const sessionData: SessionTokenResponse = await nangoResponse.json();

    log.info('Nango session token created', {
      userId,
      providerConfigKey,
      expiresAt: sessionData.expiresAt,
    });

    return NextResponse.json(sessionData);
  } catch (error) {
    log.error('Session token creation error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}