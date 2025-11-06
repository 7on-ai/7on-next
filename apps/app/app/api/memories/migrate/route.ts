// apps/app/app/api/memories/migrate/route.ts
// ใช้เพื่อ migrate database schema ให้ตรงกับโค้ด
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

    if (!user?.northflankProjectId) {
      return NextResponse.json({ error: 'No project found' }, { status: 400 });
    }

    // Get connection string
    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    if (!connectionString) {
      return NextResponse.json({ error: 'Cannot connect to DB' }, { status: 500 });
    }

    // Run migration
    const client = new Client({ connectionString });
    await client.connect();

    try {
      // ✅ Check if user_id column exists
      const checkColumn = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'user_data_schema' 
          AND table_name = 'memories' 
          AND column_name = 'user_id'
      `);

      if (checkColumn.rows.length === 0) {
        console.log('📝 Adding user_id column...');
        
        // Add user_id column
        await client.query(`
          ALTER TABLE user_data_schema.memories 
          ADD COLUMN IF NOT EXISTS user_id TEXT
        `);

        // Create index
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_memories_user 
          ON user_data_schema.memories(user_id)
        `);

        console.log('✅ Migration completed!');
      } else {
        console.log('ℹ️ user_id column already exists');
      }

      // Check current data
      const count = await client.query(`
        SELECT COUNT(*) as total 
        FROM user_data_schema.memories
      `);

      return NextResponse.json({
        success: true,
        message: 'Migration completed',
        totalRecords: parseInt(count.rows[0].total),
      });

    } finally {
      await client.end();
    }

  } catch (error) {
    console.error('💥 Migration error:', error);
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
        },
      }
    );

    if (!addonsResponse.ok) return null;

    const addonsData = await addonsResponse.json();
    const addonsList = addonsData.data?.addons || addonsData.data || [];
    
    if (!Array.isArray(addonsList)) return null;
    
    const postgresAddon = addonsList.find((a: any) => a.spec?.type === 'postgresql');
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
    return credentials.data?.envs?.EXTERNAL_POSTGRES_URI || 
           credentials.data?.envs?.POSTGRES_URI || 
           null;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}