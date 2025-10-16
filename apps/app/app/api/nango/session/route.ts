import { auth } from '@repo/auth/server';
import { log } from '@repo/observability/log';
import { NextResponse } from 'next/server';

interface SessionTokenRequest {
  providerConfigKey: string;
}

interface NangoSessionResponse {
  token: string;
  expires_at?: string;
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
      log.error('❌ Missing providerConfigKey');
      return NextResponse.json(
        { error: 'providerConfigKey is required' },
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

    // ✅ Request body according to Nango API docs
    // https://docs.nango.dev/reference/api/connect-sessions/post
    const requestBody = {
      end_user: {
        id: userId,
        organization_id: userId, // Optional but recommended
      },
      allowed_integrations: [providerConfigKey],
    };

    log.info('🔄 Calling Nango Connect Sessions API', { 
      endpoint: 'https://api.nango.dev/connect/sessions',
      providerConfigKey,
      userId,
    });

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

    // Get response as text first for better error handling
    const responseText = await nangoResponse.text();
    
    log.info('📡 Nango API response', { 
      status: nangoResponse.status,
      statusText: nangoResponse.statusText,
      contentType: nangoResponse.headers.get('content-type'),
      bodyLength: responseText.length,
    });

    // Handle non-OK responses
    if (!nangoResponse.ok) {
      let errorData: any;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { message: responseText };
      }
      
      log.error('❌ Nango API error', { 
        status: nangoResponse.status,
        statusText: nangoResponse.statusText,
        error: errorData,
        requestBody,
      });
      
      // Return user-friendly error
      return NextResponse.json(
        { 
          error: errorData.error || errorData.message || 'Failed to create session',
          details: errorData,
        },
        { status: nangoResponse.status }
      );
    }

    // Parse successful response
    let sessionData: NangoSessionResponse;
    try {
      sessionData = JSON.parse(responseText);
    } catch (parseError) {
      log.error('❌ Failed to parse Nango response', { 
        responseText,
        parseError: parseError instanceof Error ? parseError.message : 'Unknown',
      });
      return NextResponse.json(
        { error: 'Invalid response from Nango API' },
        { status: 500 }
      );
    }

    // Log the full response for debugging
    log.info('📦 Nango response data', {
      keys: Object.keys(sessionData),
      hasToken: !!sessionData.token,
      tokenLength: sessionData.token?.length,
      tokenPrefix: sessionData.token?.substring(0, 15),
    });

    // Validate token exists
    if (!sessionData.token) {
      log.error('❌ No token in Nango response', { 
        sessionData,
        responseKeys: Object.keys(sessionData),
      });
      return NextResponse.json(
        { 
          error: 'No token in Nango response',
          receivedKeys: Object.keys(sessionData),
        },
        { status: 500 }
      );
    }

    log.info('✅ Session token created successfully', {
      userId,
      providerConfigKey,
      tokenLength: sessionData.token.length,
      expiresAt: sessionData.expires_at,
    });

    // Return consistent camelCase response
    return NextResponse.json({
      token: sessionData.token,
      expiresAt: sessionData.expires_at,
    });
    
  } catch (error) {
    log.error('💥 Unexpected error', { 
      error,
      message: error instanceof Error ? error.message : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}