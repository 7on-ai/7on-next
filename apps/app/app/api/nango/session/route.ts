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

    const body = (await request.json()) as SessionTokenRequest;
    const { providerConfigKey } = body;

    if (!providerConfigKey) {
      return NextResponse.json(
        { error: 'providerConfigKey is required' },
        { status: 400 }
      );
    }

    const nangoSecretKey = process.env.NANGO_SECRET_KEY;
    if (!nangoSecretKey) {
      return NextResponse.json(
        { error: 'Nango not configured' },
        { status: 500 }
      );
    }

    // ✅ วิธีใหม่: ใช้ Connect Sessions API
    const requestBody = {
      end_user: {
        id: userId,
        // ไม่ต้องใส่ organization_id ถ้าไม่มี
      },
      // ✅ สำคัญมาก: ต้องระบุ allowed_integrations
      allowed_integrations: [providerConfigKey],
    };

    log.info('Creating Nango connect session', { 
      userId,
      providerConfigKey,
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

    const responseText = await nangoResponse.text();
    
    if (!nangoResponse.ok) {
      let errorData: any;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { message: responseText };
      }
      
      log.error('Nango API error', { 
        status: nangoResponse.status,
        error: errorData,
      });
      
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: nangoResponse.status }
      );
    }

    const sessionData = JSON.parse(responseText);

    if (!sessionData.data?.token) {
      log.error('No token in Nango response', { sessionData });
      return NextResponse.json(
        { error: 'No token received' },
        { status: 500 }
      );
    }

    log.info('Session token created successfully', {
      userId,
      providerConfigKey,
    });

    return NextResponse.json({
      token: sessionData.data.token,
      expiresAt: sessionData.data.expires_at,
    });
    
  } catch (error) {
    log.error('Session endpoint error', { error });
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}