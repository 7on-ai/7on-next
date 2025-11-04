// apps/app/app/api/memories/route.ts - COMPLETE FIXED VERSION
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';
import { Client } from 'pg';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;

/**
 * GET - Fetch user memories from Postgres
 */
export async function GET(request: NextRequest) {
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
        postgresSchemaInitialized: true,
      },
    });
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    if (!user.postgresSchemaInitialized) {
      return NextResponse.json({ 
        error: 'Database not initialized',
        memories: []
      }, { status: 200 });
    }
    
    if (!user.northflankProjectId) {
      return NextResponse.json({ 
        error: 'No project found',
        memories: []
      }, { status: 200 });
    }
    
    // Get Postgres connection
    const postgresConnection = await getPostgresConnection(user.northflankProjectId);
    
    if (!postgresConnection) {
      return NextResponse.json({ 
        error: 'Failed to connect to database',
        memories: []
      }, { status: 500 });
    }
    
    // Query memories
    const client = new Client({ connectionString: postgresConnection.connectionString });
    
    try {
      await client.connect();
      
      const result = await client.query(`
        SELECT id, content, metadata, created_at, updated_at
        FROM user_data_schema.memories
        ORDER BY created_at DESC
        LIMIT 100
      `);
      
      return NextResponse.json({ 
        success: true,
        memories: result.rows 
      });
      
    } finally {
      await client.end();
    }
    
  } catch (error) {
    console.error('Error fetching memories:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: (error as Error).message,
      memories: []
    }, { status: 500 });
  }
}

/**
 * DELETE - Delete a specific memory
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const memoryId = searchParams.get('id');
    
    if (!memoryId) {
      return NextResponse.json({ error: 'Memory ID required' }, { status: 400 });
    }
    
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: {
        northflankProjectId: true,
        postgresSchemaInitialized: true,
      },
    });
    
    if (!user?.postgresSchemaInitialized || !user.northflankProjectId) {
      return NextResponse.json({ error: 'Database not ready' }, { status: 400 });
    }
    
    const postgresConnection = await getPostgresConnection(user.northflankProjectId);
    
    if (!postgresConnection) {
      return NextResponse.json({ error: 'Failed to connect to database' }, { status: 500 });
    }
    
    const client = new Client({ connectionString: postgresConnection.connectionString });
    
    try {
      await client.connect();
      
      await client.query(`
        DELETE FROM user_data_schema.memories
        WHERE id = $1
      `, [memoryId]);
      
      return NextResponse.json({ success: true });
      
    } finally {
      await client.end();
    }
    
  } catch (error) {
    console.error('Error deleting memory:', error);
    return NextResponse.json({ 
      error: 'Failed to delete memory',
      details: (error as Error).message
    }, { status: 500 });
  }
}

/**
 * Helper: Get Postgres connection string from Northflank
 */
async function getPostgresConnection(projectId: string) {
  try {
    console.log('📝 Getting Postgres connection from Northflank...');
    
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
      console.error('❌ Failed to list addons:', addonsResponse.status);
      return null;
    }
    
    const addonsData = await addonsResponse.json();
    const addons = addonsData.data?.addons || [];
    const postgresAddon = addons.find(
      (addon: any) => addon.spec?.type === 'postgresql'
    );
    
    if (!postgresAddon) {
      console.error('❌ No PostgreSQL addon found');
      return null;
    }
    
    if (postgresAddon.status !== 'running') {
      console.error('❌ PostgreSQL addon not running:', postgresAddon.status);
      return null;
    }
    
    console.log('📝 Getting credentials...');
    
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
      console.error('❌ Failed to get credentials');
      return null;
    }
    
    const credentials = await credentialsResponse.json();
    const envs = credentials.data?.envs;
    
    const connectionString = 
      envs?.EXTERNAL_POSTGRES_URI || 
      envs?.POSTGRES_URI;
    
    if (!connectionString) {
      console.error('❌ No connection string found');
      return null;
    }
    
    console.log('✅ Connection retrieved');
    
    return {
      connectionString,
      config: parsePostgresUrl(connectionString),
    };
    
  } catch (error) {
    console.error('💥 Error getting Postgres connection:', error);
    return null;
  }
}

/**
 * Helper: Parse Postgres URL
 */
function parsePostgresUrl(url: string) {
  try {
    const regex = /postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/;
    const match = url.match(regex);
    
    if (!match) return null;
    
    const [, user, password, host, port, database] = match;
    
    return {
      host,
      port: parseInt(port, 10),
      database,
      user,
      password,
    };
  } catch (error) {
    return null;
  }
}