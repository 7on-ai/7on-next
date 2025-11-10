// apps/app/app/api/lora/sync-counts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';
import { Client } from 'pg';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { 
        id: true, 
        northflankProjectId: true, 
        postgresSchemaInitialized: true 
      },
    });

    if (!user?.northflankProjectId || !user.postgresSchemaInitialized) {
      return NextResponse.json(
        { error: 'Database not initialized' }, 
        { status: 400 }
      );
    }

    // Get Postgres connection
    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    if (!connectionString) {
      return NextResponse.json(
        { error: 'Cannot connect to database' }, 
        { status: 500 }
      );
    }

    // Connect and count data
    const client = new Client({ connectionString });
    await client.connect();

    try {
      // Count Good Channel (from conversations + memory_embeddings)
      const [goodConvResult, memoryResult] = await Promise.all([
        client.query(`
          SELECT COUNT(*) as count 
          FROM user_data_schema.stm_good 
          WHERE user_id = $1
        `, [user.id]),
        client.query(`
          SELECT COUNT(*) as count 
          FROM user_data_schema.memory_embeddings 
          WHERE user_id = $1
        `, [user.id])
      ]);

      // Count Bad Channel
      const badResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM user_data_schema.stm_bad 
        WHERE user_id = $1
      `, [user.id]);

      // Count MCL Chains
      const mclResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM user_data_schema.mcl_chains 
        WHERE user_id = $1
      `, [user.id]);

      // Parse counts
      const goodCount = parseInt(goodConvResult.rows[0]?.count || '0');
      const memoryCount = parseInt(memoryResult.rows[0]?.count || '0');
      const badCount = parseInt(badResult.rows[0]?.count || '0');
      const mclCount = parseInt(mclResult.rows[0]?.count || '0');

      console.log('📊 Synced counts:', {
        good: goodCount,
        memory: memoryCount,
        bad: badCount,
        mcl: mclCount,
      });

      // Update Prisma database
      await db.user.update({
        where: { id: user.id },
        data: {
          goodChannelCount: goodCount + memoryCount,
          badChannelCount: badCount,
          mclChainCount: mclCount,
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        counts: {
          goodChannel: goodCount + memoryCount,
          badChannel: badCount,
          mclChains: mclCount,
          total: goodCount + memoryCount + badCount + mclCount,
        },
      });

    } finally {
      await client.end();
    }

  } catch (error) {
    console.error('❌ Sync counts error:', error);
    return NextResponse.json(
      { error: (error as Error).message }, 
      { status: 500 }
    );
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
        } 
      }
    );

    if (!addonsResponse.ok) return null;

    const addonsData = await addonsResponse.json();
    const postgresAddon = addonsData.data?.addons?.find(
      (a: any) => a.spec?.type === 'postgresql'
    );

    if (!postgresAddon) return null;

    const credentialsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}/credentials`,
      { 
        headers: { 
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        } 
      }
    );

    if (!credentialsResponse.ok) return null;

    const credentials = await credentialsResponse.json();
    return credentials.data?.envs?.EXTERNAL_POSTGRES_URI || 
           credentials.data?.envs?.POSTGRES_URI || 
           null;

  } catch (error) {
    console.error('Error getting connection string:', error);
    return null;
  }
}