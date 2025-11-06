// apps/app/app/api/mem0/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';
import { getMem0Instance } from '@/lib/mem0-service';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;

// GET - Search memories
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';
    const limit = parseInt(searchParams.get('limit') || '5');

    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { id: true, northflankProjectId: true, postgresSchemaInitialized: true },
    });

    if (!user?.postgresSchemaInitialized || !user.northflankProjectId) {
      return NextResponse.json({ error: 'Database not ready' }, { status: 400 });
    }

    const postgresConfig = await getPostgresConfig(user.northflankProjectId);
    if (!postgresConfig) {
      return NextResponse.json({ error: 'Failed to get Postgres config' }, { status: 500 });
    }

    const mem0 = await getMem0Instance(postgresConfig);
    const memories = await mem0.searchMemories(user.id, query, limit);

    return NextResponse.json({ success: true, memories });
  } catch (error) {
    console.error('Mem0 search error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// POST - Add memory
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages format' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { id: true, northflankProjectId: true, postgresSchemaInitialized: true },
    });

    if (!user?.postgresSchemaInitialized || !user.northflankProjectId) {
      return NextResponse.json({ error: 'Database not ready' }, { status: 400 });
    }

    const postgresConfig = await getPostgresConfig(user.northflankProjectId);
    if (!postgresConfig) {
      return NextResponse.json({ error: 'Failed to get Postgres config' }, { status: 500 });
    }

    const mem0 = await getMem0Instance(postgresConfig);
    const result = await mem0.addMemory(user.id, messages);

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Mem0 add error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// DELETE - Delete memory
export async function DELETE(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const memoryId = searchParams.get('id');

    if (!memoryId) {
      return NextResponse.json({ error: 'Memory ID required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { id: true, northflankProjectId: true, postgresSchemaInitialized: true },
    });

    if (!user?.postgresSchemaInitialized || !user.northflankProjectId) {
      return NextResponse.json({ error: 'Database not ready' }, { status: 400 });
    }

    const postgresConfig = await getPostgresConfig(user.northflankProjectId);
    if (!postgresConfig) {
      return NextResponse.json({ error: 'Failed to get Postgres config' }, { status: 500 });
    }

    const mem0 = await getMem0Instance(postgresConfig);
    await mem0.delete(memoryId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mem0 delete error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// Helper function
async function getPostgresConfig(projectId: string) {
  const addonsResponse = await fetch(
    `https://api.northflank.com/v1/projects/${projectId}/addons`,
    {
      headers: {
        Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!addonsResponse.ok) return null;

  const addons = await addonsResponse.json();
  const postgresAddon = addons.data?.find((a: any) => a.spec?.type === 'postgresql');

  if (!postgresAddon?.connection) return null;

  const conn = postgresAddon.connection;

  return {
    postgresHost: conn.host,
    postgresPort: parseInt(conn.port || '5432'),
    postgresDatabase: conn.database,
    postgresUser: conn.user,
    postgresPassword: conn.password,
  };
}