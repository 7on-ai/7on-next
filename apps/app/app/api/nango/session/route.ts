import { auth } from '@repo/auth/server';
import { log } from '@repo/observability/log';
import { NextResponse } from 'next/server';

interface SessionTokenRequest {
  providerConfigKey: string;
}

interface SessionTokenResponse {
  token: string;
  expiresAt: string;
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      log.error('No userId in auth');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as SessionTokenRequest;
    const { providerConfigKey } = body;

    log.info('📥 Session request received', { 
      providerConfigKey, 
      userId,
    });

    if (!providerConfigKey) {
      log.error('❌ Missing providerConfigKey', { body });
      return NextResponse.json(
        { error: 'providerConfigKey is required', field: 'providerConfigKey' },
        { status: 400 }
      );
    }

    const nangoSecretKey = process.env.NANGO_SECRET_KEY;
    if (!nangoSecretKey) {
      log.error('❌ NANGO_SECRET_KEY not configured');
      return NextResponse.json(
        { error: 'Nango not configured' },
        { status: 500 }
      );
    }

    // ✅ CORRECT REQUEST BODY according to Nango docs
    const requestBody = {
      end_user: {
        id: userId,
      },
      allowed_integrations: [providerConfigKey],
    };

    log.info('🔄 Calling Nango API', { requestBody });

    const nangoResponse = await fetch(
      'https://api.nango.dev/connect/sessions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${nangoSecretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    const responseText = await nangoResponse.text();
    log.info('📡 Nango response', { 
      status: nangoResponse.status,
      bodyLength: responseText.length
    });

    if (!nangoResponse.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { message: responseText };
      }
      
      log.error('❌ Nango session creation failed', { 
        error: errorData,
        status: nangoResponse.status,
        requestBody 
      });
      
      return NextResponse.json(
        { 
          error: errorData.message || errorData.error || 'Failed to create session token',
          details: errorData 
        },
        { status: nangoResponse.status }
      );
    }

    const sessionData: SessionTokenResponse = JSON.parse(responseText);

    // ✅ VALIDATE response has required fields
    if (!sessionData.token) {
      log.error('❌ No token in Nango response', { sessionData });
      return NextResponse.json(
        { error: 'Invalid response from Nango: missing token' },
        { status: 500 }
      );
    }

    log.info('✅ Nango session token created', {
      userId,
      providerConfigKey,
      expiresAt: sessionData.expiresAt,
      tokenLength: sessionData.token.length,
    });

    // ✅ Return the exact structure frontend expects
    return NextResponse.json({
      token: sessionData.token,
      expiresAt: sessionData.expiresAt,
    });
  } catch (error) {
    log.error('💥 Session token creation error', { 
      error,
      message: error instanceof Error ? error.message : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}