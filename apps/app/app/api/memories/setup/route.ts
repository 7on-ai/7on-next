// apps/app/app/api/memories/setup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;

/**
 * POST /api/memories/setup - Manual database setup
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get user
    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: {
        id: true,
        northflankProjectId: true,
        postgresSchemaInitialized: true,
        n8nPostgresCredentialId: true,
        n8nUrl: true,
        n8nUserEmail: true,
        n8nEncryptionKey: true,
        email: true,
        northflankProjectStatus: true,
      },
    });
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Check if already initialized
    if (user.postgresSchemaInitialized && user.n8nPostgresCredentialId) {
      return NextResponse.json({
        success: true,
        message: 'Database already initialized',
        credentialId: user.n8nPostgresCredentialId,
      });
    }
    
    // Check prerequisites
    if (!user.northflankProjectId) {
      return NextResponse.json(
        { error: 'No Northflank project found' },
        { status: 400 }
      );
    }
    
    if (user.northflankProjectStatus !== 'ready') {
      return NextResponse.json(
        { error: 'Northflank project is not ready yet' },
        { status: 400 }
      );
    }
    
    if (!user.n8nUrl || !user.n8nEncryptionKey) {
      return NextResponse.json(
        { error: 'N8N configuration is missing' },
        { status: 400 }
      );
    }
    
    // ========================================
    // STEP 1: Get Postgres Connection
    // ========================================
    const postgresConnection = await getPostgresConnection(user.northflankProjectId);
    
    if (!postgresConnection) {
      return NextResponse.json(
        { error: 'Failed to get Postgres connection' },
        { status: 500 }
      );
    }
    
    // ========================================
    // STEP 2: Initialize Schema
    // ========================================
    const { initializeUserPostgresSchema } = await import('@/lib/postgres-setup');
    
    const schemaSuccess = await initializeUserPostgresSchema(
      postgresConnection.connectionString
    );
    
    if (!schemaSuccess) {
      await db.user.update({
        where: { id: user.id },
        data: {
          postgresSetupError: 'Failed to initialize schema',
          updatedAt: new Date(),
        },
      });
      
      return NextResponse.json(
        { error: 'Failed to initialize database schema' },
        { status: 500 }
      );
    }
    
    // ========================================
    // STEP 3: Create N8N Credential
    // ========================================
    const { createPostgresCredentialInN8n } = await import('@/lib/n8n-credentials');
    
    const n8nEmail = user.n8nUserEmail || user.email;
    const n8nPassword = `7On${user.n8nEncryptionKey}`;
    
    const credentialId = await createPostgresCredentialInN8n({
      n8nUrl: user.n8nUrl,
      n8nEmail,
      n8nPassword,
      postgresConfig: postgresConnection.config,
    });
    
    if (!credentialId) {
      await db.user.update({
        where: { id: user.id },
        data: {
          postgresSchemaInitialized: true, // Schema created
          postgresSetupError: 'Failed to create n8n credential',
          updatedAt: new Date(),
        },
      });
      
      return NextResponse.json(
        { error: 'Schema created but failed to create n8n credential' },
        { status: 500 }
      );
    }
    
    // ========================================
    // STEP 4: Update Database
    // ========================================
    await db.user.update({
      where: { id: user.id },
      data: {
        postgresSchemaInitialized: true,
        n8nPostgresCredentialId: credentialId,
        postgresSetupError: null,
        postgresSetupAt: new Date(),
        updatedAt: new Date(),
      },
    });
    
    return NextResponse.json({
      success: true,
      message: 'Database setup completed successfully',
      credentialId,
    });
    
  } catch (error) {
    console.error('Error in memories setup:', error);
    return NextResponse.json(
      { error: 'Setup failed', details: (error as Error).message },
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
    const postgresAddon = addons.data?.find((a: any) => a.spec?.type === 'postgresql');
    
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