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

    const ollamaUrl = process.env.OLLAMA_EXTERNAL_URL;
    const vectorMemory = await getVectorMemory(connectionString, ollamaUrl);

    // ✅ Pass user.id (not clerkUserId)
    const memories = query
      ? await vectorMemory.searchMemories(user.id, query)
      : await vectorMemory.getAllMemories(user.id);

    console.log(`✅ Fetched ${memories.length} memories for user ${user.id}`);

    return NextResponse.json({ success: true, memories });
  } catch (error) {
    console.error('❌ GET error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { content, metadata } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

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

    const ollamaUrl = process.env.OLLAMA_EXTERNAL_URL;
    const vectorMemory = await getVectorMemory(connectionString, ollamaUrl);
    
    // ✅ CRITICAL: Pass user.id (database ID, not Clerk ID)
    console.log(`📝 Adding memory for user: ${user.id}`);
    await vectorMemory.addMemory(user.id, content.trim(), metadata);
    
    console.log(`✅ Memory added successfully`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ POST error:', error);
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
      select: { id: true, northflankProjectId: true, postgresSchemaInitialized: true },
    });

    if (!user?.postgresSchemaInitialized || !user.northflankProjectId) {
      return NextResponse.json({ error: 'DB not ready' }, { status: 400 });
    }

    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    if (!connectionString) {
      return NextResponse.json({ error: 'DB connection failed' }, { status: 500 });
    }

    const ollamaUrl = process.env.OLLAMA_EXTERNAL_URL;
    const vectorMemory = await getVectorMemory(connectionString, ollamaUrl);
    
    // ✅ Verify ownership before deleting
    console.log(`🗑️  Deleting memory ${memoryId} for user ${user.id}`);
    await vectorMemory.deleteMemory(memoryId, user.id);
    
    console.log(`✅ Memory deleted`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ DELETE error:', error);
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

    if (!addonsResponse.ok) {
      console.error('❌ Addons API failed:', addonsResponse.status);
      return null;
    }

    const addonsData = await addonsResponse.json();
    const addonsList = addonsData.data?.addons || addonsData.data || [];
    
    if (!Array.isArray(addonsList)) {
      console.error('❌ Addons is not array');
      return null;
    }
    
    const postgresAddon = addonsList.find((a: any) => a.spec?.type === 'postgresql');

    if (!postgresAddon) {
      console.error('❌ No PostgreSQL addon found');
      return null;
    }

    const credentialsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}/credentials`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!credentialsResponse.ok) {
      console.error('❌ Credentials API failed');
      return null;
    }

    const credentials = await credentialsResponse.json();
    const connectionString = credentials.data?.envs?.EXTERNAL_POSTGRES_URI || 
                            credentials.data?.envs?.POSTGRES_URI || 
                            null;
    
    return connectionString;
  } catch (error) {
    console.error('💥 Error getting connection:', error);
    return null;
  }
}