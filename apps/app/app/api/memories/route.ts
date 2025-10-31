// apps/app/app/api/memories/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';
import { Client } from 'pg';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;

/**
 * GET /api/memories - Fetch user's memories
 */
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get user from database
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
        status: 'pending',
      }, { status: 503 });
    }
    
    if (!user.northflankProjectId) {
      return NextResponse.json({ error: 'No project found' }, { status: 404 });
    }
    
    // Get Postgres connection from Northflank
    const postgresConnection = await getPostgresConnection(user.northflankProjectId);
    
    if (!postgresConnection) {
      return NextResponse.json(
        { error: 'Database connection unavailable' },
        { status: 503 }
      );
    }
    
    // Query memories table
    const client = new Client({ 
      connectionString: postgresConnection.connectionString 
    });
    
    try {
      await client.connect();
      
      const result = await client.query(`
        SELECT 
          id, 
          content, 
          metadata, 
          created_at, 
          updated_at
        FROM user_data_schema.memories
        ORDER BY created_at DESC
        LIMIT 100
      `);
      
      return NextResponse.json({
        success: true,
        memories: result.rows,
        count: result.rowCount || 0,
      });
    } finally {
      await client.end();
    }
  } catch (error) {
    console.error('Error fetching memories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch memories', details: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/memories - Create new memory (optional, for testing)
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { content, metadata } = body;
    
    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }
    
    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { 
        id: true, 
        northflankProjectId: true,
        postgresSchemaInitialized: true,
      },
    });
    
    if (!user?.postgresSchemaInitialized || !user.northflankProjectId) {
      return NextResponse.json({ error: 'Database not ready' }, { status: 503 });
    }
    
    const postgresConnection = await getPostgresConnection(user.northflankProjectId);
    
    if (!postgresConnection) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }
    
    const client = new Client({ 
      connectionString: postgresConnection.connectionString 
    });
    
    try {
      await client.connect();
      
      const result = await client.query(
        `
        INSERT INTO user_data_schema.memories (content, metadata)
        VALUES ($1, $2)
        RETURNING *
        `,
        [content, metadata || {}]
      );
      
      return NextResponse.json({
        success: true,
        memory: result.rows[0],
      });
    } finally {
      await client.end();
    }
  } catch (error) {
    console.error('Error creating memory:', error);
    return NextResponse.json(
      { error: 'Failed to create memory', details: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/memories?id=xxx - Delete memory
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const memoryId = searchParams.get('id');
    
    if (!memoryId) {
      return NextResponse.json({ error: 'Memory ID is required' }, { status: 400 });
    }
    
    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { 
        id: true, 
        northflankProjectId: true,
        postgresSchemaInitialized: true,
      },
    });
    
    if (!user?.postgresSchemaInitialized || !user.northflankProjectId) {
      return NextResponse.json({ error: 'Database not ready' }, { status: 503 });
    }
    
    const postgresConnection = await getPostgresConnection(user.northflankProjectId);
    
    if (!postgresConnection) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }
    
    const client = new Client({ 
      connectionString: postgresConnection.connectionString 
    });
    
    try {
      await client.connect();
      
      const result = await client.query(
        'DELETE FROM user_data_schema.memories WHERE id = $1 RETURNING id',
        [memoryId]
      );
      
      if (result.rowCount === 0) {
        return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
      }
      
      return NextResponse.json({
        success: true,
        message: 'Memory deleted',
      });
    } finally {
      await client.end();
    }
  } catch (error) {
    console.error('Error deleting memory:', error);
    return NextResponse.json(
      { error: 'Failed to delete memory', details: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * Helper: Get Postgres connection from Northflank
 */
async function getPostgresConnection(projectId: string) {
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
    const postgresAddon = addons.data?.find((a: any) => 
      a.spec?.type === 'postgresql'
    );
    
    if (!postgresAddon) return null;
    
    const connectionResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!connectionResponse.ok) return null;
    
    const details = await connectionResponse.json();
    const connection = details.data?.connection;
    
    if (!connection) return null;
    
    return {
      connectionString: connection.connectionString,
      config: {
        host: connection.host,
        port: parseInt(connection.port || '5432'),
        database: connection.database,
        user: connection.user,
        password: connection.password,
      },
    };
  } catch (error) {
    console.error('Error getting Postgres connection:', error);
    return null;
  }
}