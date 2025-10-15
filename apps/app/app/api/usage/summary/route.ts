import { auth } from '@repo/auth/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // TODO: Implement actual usage tracking
    // For now, return mock data
    return NextResponse.json({
      apiCalls: 0,
      connections: 0,
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
    });
  } catch (error) {
    console.error('Error fetching usage:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}