import { auth } from '@repo/auth/server';
import { log } from '@repo/observability/log';
import { NextResponse } from 'next/server';

interface SessionTokenRequest {
  providerConfigKey: string;
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { providerConfigKey } = (await request.json()) as SessionTokenRequest;
    if (!providerConfigKey) {
      return NextResponse.json({ error: 'providerConfigKey is required' }, { status: 400 });
    }

    const nangoSecretKey = process.env.NANGO_SECRET_KEY;
    if (!nangoSecretKey) {
      return NextResponse.json({ error: 'Nango secret key missing' }, { status: 500 });
    }

    const requestBody = {
      app_id: process.env.NANGO_APP_ID, // ✅ ตามเอกสารใหม่ (optional แต่แนะนำ)
      end_user: { id: userId },
      allowed_integrations: [providerConfigKey],
    };

    const nangoResponse = await fetch('https://api.nango.dev/connect/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${nangoSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const text = await nangoResponse.text();

    if (!nangoResponse.ok) {
      let err;
      try {
        err = JSON.parse(text);
      } catch {
        err = { message: text };
      }
      log.error('❌ Nango API error', { status: nangoResponse.status, err });
      return NextResponse.json({ error: err.error || err.message || 'Nango error' }, { status: nangoResponse.status });
    }

    const parsed = JSON.parse(text);
    const token = parsed?.data?.token || parsed?.session?.token;
    const expiresAt = parsed?.data?.expires_at || parsed?.session?.expires_at;

    if (!token) {
      return NextResponse.json({ error: 'No session token in response', parsed }, { status: 500 });
    }

    return NextResponse.json({ token, expiresAt });
  } catch (error) {
    log.error('💥 Unexpected error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
