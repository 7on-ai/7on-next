// apps/app/app/api/memories/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';
import { getVectorMemory } from '@/lib/vector-memory';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { id: true, northflankProjectId: true, postgresSchemaInitialized: true },
    });

    if (!user?.postgresSchemaInitialized || !user.northflankProjectId) {
      return NextResponse.json({ memories: [] }, { status: 200 });
    }

    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    if (!connectionString) {
      return NextResponse.json({ error: 'DB connection failed' }, { status: 500 });
    }

    const vectorMemory = await getVectorMemory(connectionString);

    const memories = query
      ? await vectorMemory.searchMemories(user.id, query)
      : await vectorMemory.getAllMemories(user.id);

    return NextResponse.json({ success: true, memories });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { content, metadata } = body;

    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { id: true, northflankProjectId: true, postgresSchemaInitialized: true },
    });

    if (!user?.postgresSchemaInitialized || !user.northflankProjectId) {
      return NextResponse.json({ error: 'DB not ready' }, { status: 400 });
    }

    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    if (!connectionString) {
      return NextResponse.json({ error: 'DB connection failed' }, { status: 500 });
    }

    const vectorMemory = await getVectorMemory(connectionString);
    await vectorMemory.addMemory(user.id, content, metadata);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const memoryId = searchParams.get('id');
    if (!memoryId) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { northflankProjectId: true, postgresSchemaInitialized: true },
    });

    if (!user?.postgresSchemaInitialized || !user.northflankProjectId) {
      return NextResponse.json({ error: 'DB not ready' }, { status: 400 });
    }

    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    if (!connectionString) {
      return NextResponse.json({ error: 'DB connection failed' }, { status: 500 });
    }

    const vectorMemory = await getVectorMemory(connectionString);
    await vectorMemory.deleteMemory(memoryId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

async function getPostgresConnectionString(projectId: string): Promise<string | null> {
  try {
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

    if (!postgresAddon) return null;

    const credentialsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}/credentials`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!credentialsResponse.ok) return null;

    const credentials = await credentialsResponse.json();
    return credentials.data?.envs?.EXTERNAL_POSTGRES_URI || credentials.data?.envs?.POSTGRES_URI || null;
  } catch (error) {
    console.error('Error getting connection:', error);
    return null;
  }
}