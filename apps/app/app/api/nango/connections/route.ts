import { auth } from '@repo/auth/server';
import { log } from '@repo/observability/log';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const nangoSecretKey = process.env.NANGO_SECRET_KEY;
    if (!nangoSecretKey) {
      return NextResponse.json({ error: 'Nango not configured' }, { status: 500 });
    }

    // Fetch connections from Nango
    const response = await fetch(
      `https://api.nango.dev/connection?user_id=${userId}`,
      {
        headers: {
          'Authorization': `Bearer ${nangoSecretKey}`,
        },
      }
    );

    if (!response.ok) {
      log.error('Failed to fetch connections from Nango', { status: response.status });
      return NextResponse.json({ connections: [] });
    }

    const data = await response.json();
    
    return NextResponse.json({
      connections: data.connections || [],
    });
  } catch (error) {
    log.error('Error fetching connections', { error });
    return NextResponse.json({ connections: [] });
  }
}