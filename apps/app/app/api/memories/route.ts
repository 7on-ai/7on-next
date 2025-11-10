// apps/app/app/api/memories/route.ts - FIXED: POST ผ่าน Gating
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';
import { getVectorMemory } from '@/lib/vector-memory';
import { Client } from 'pg';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;
const GATING_SERVICE_URL = process.env.GATING_SERVICE_URL || 'http://localhost:8080';

// ... GET และ DELETE methods เหมือนเดิม ...

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

    // ✅ STEP 1: Call Gating Service
    console.log('🛡️  Routing through Gating Service...');
    
    const gatingResponse = await fetch(`${GATING_SERVICE_URL}/gating/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        text: content.trim(),
        database_url: connectionString,
        metadata: metadata || {},
      }),
    });

    if (!gatingResponse.ok) {
      const errorText = await gatingResponse.text();
      console.error('❌ Gating failed:', errorText);
      return NextResponse.json({ 
        error: 'Content moderation failed',
        details: errorText 
      }, { status: 500 });
    }

    const gatingData = await gatingResponse.json();
    console.log('✅ Gating result:', {
      routing: gatingData.routing,
      valence: gatingData.valence,
      scores: gatingData.scores,
    });

    // ✅ STEP 2: Data already stored in appropriate channel by gating service
    // Good channel → stm_good
    // Bad channel → stm_bad (with counterfactual)
    // Review → stm_review

    // ✅ STEP 3: Also add to memory_embeddings for semantic search
    const ollamaUrl = process.env.OLLAMA_EXTERNAL_URL;
    const vectorMemory = await getVectorMemory(connectionString, ollamaUrl);
    
    console.log(`📝 Adding to memory_embeddings for user: ${user.id}`);
    await vectorMemory.addMemory(user.id, content.trim(), {
      ...metadata,
      gating_routing: gatingData.routing,
      gating_valence: gatingData.valence,
      gating_scores: gatingData.scores,
    });
    
    // ✅ STEP 4: Update counts based on routing
    const countUpdates: any = {};
    
    if (gatingData.routing === 'good') {
      countUpdates.goodChannelCount = { increment: 1 };
    } else if (gatingData.routing === 'bad') {
      countUpdates.badChannelCount = { increment: 1 };
    }
    
    await db.user.update({
      where: { id: user.id },
      data: countUpdates,
    });

    console.log(`✅ Memory added via ${gatingData.routing} channel`);

    return NextResponse.json({ 
      success: true,
      routing: gatingData.routing,
      valence: gatingData.valence,
      safe_counterfactual: gatingData.safe_counterfactual,
      scores: gatingData.scores,
    });

  } catch (error) {
    console.error('❌ POST error:', error);
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