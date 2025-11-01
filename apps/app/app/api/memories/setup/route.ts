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
    console.log('🚀 Memory setup started');
    
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      console.error('❌ Unauthorized - no clerk user');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log('✅ Clerk user authenticated:', clerkUserId);
    
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
      console.error('❌ User not found in database');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    console.log('✅ User found:', {
      id: user.id,
      projectId: user.northflankProjectId,
      projectStatus: user.northflankProjectStatus,
      schemaInitialized: user.postgresSchemaInitialized,
      hasCredential: !!user.n8nPostgresCredentialId,
    });
    
    if (user.postgresSchemaInitialized && user.n8nPostgresCredentialId) {
      console.log('ℹ️ Database already initialized');
      return NextResponse.json({
        success: true,
        message: 'Database already initialized',
        credentialId: user.n8nPostgresCredentialId,
      });
    }
    
    if (!user.northflankProjectId) {
      console.error('❌ No Northflank project');
      return NextResponse.json(
        { error: 'No Northflank project found. Please wait for project creation.' },
        { status: 400 }
      );
    }
    
    if (user.northflankProjectStatus !== 'ready') {
      console.error('❌ Project not ready:', user.northflankProjectStatus);
      return NextResponse.json(
        { error: `Project status: ${user.northflankProjectStatus}. Please wait for project to be ready.` },
        { status: 400 }
      );
    }
    
    if (!user.n8nUrl || !user.n8nEncryptionKey) {
      console.error('❌ Missing N8N config:', {
        hasUrl: !!user.n8nUrl,
        hasKey: !!user.n8nEncryptionKey,
      });
      return NextResponse.json(
        { error: 'N8N configuration is missing. Please contact support.' },
        { status: 400 }
      );
    }
    
    console.log('✅ Prerequisites validated');
    
    // ========================================
    // STEP 1: Get Postgres Connection
    // ========================================
    console.log('📝 Getting Postgres connection...');
    const postgresConnection = await getPostgresConnection(user.northflankProjectId);
    
    if (!postgresConnection) {
      console.error('❌ Failed to get Postgres connection');
      return NextResponse.json(
        { error: 'Failed to connect to Postgres database' },
        { status: 500 }
      );
    }
    
    console.log('✅ Postgres connection retrieved');
    
    // ========================================
    // STEP 2: Initialize Schema
    // ========================================
    console.log('📝 Initializing schema...');
    
    try {
      const { initializeUserPostgresSchema } = await import('@/lib/postgres-setup');
      
      const schemaSuccess = await initializeUserPostgresSchema(
        postgresConnection.connectionString
      );
      
      if (!schemaSuccess) {
        throw new Error('Schema initialization returned false');
      }
      
      console.log('✅ Schema initialized');
    } catch (schemaError) {
      console.error('❌ Schema initialization failed:', schemaError);
      
      await db.user.update({
        where: { id: user.id },
        data: {
          postgresSetupError: `Schema init failed: ${(schemaError as Error).message}`,
          updatedAt: new Date(),
        },
      });
      
      return NextResponse.json(
        { error: 'Failed to initialize database schema', details: (schemaError as Error).message },
        { status: 500 }
      );
    }
    
    // ========================================
    // STEP 3: Create N8N Credential
    // ========================================
    console.log('📝 Creating N8N credential...');
    
    try {
      const { createPostgresCredentialInN8n } = await import('@/lib/n8n-credentials');
      
      const n8nEmail = user.n8nUserEmail || user.email;
      const n8nPassword = `7On${user.n8nEncryptionKey}`;
      
      console.log('N8N config:', {
        url: user.n8nUrl,
        email: n8nEmail,
        hasPassword: !!n8nPassword,
      });
      
      const credentialId = await createPostgresCredentialInN8n({
        n8nUrl: user.n8nUrl,
        n8nEmail,
        n8nPassword,
        postgresConfig: postgresConnection.config,
      });
      
      if (!credentialId) {
        throw new Error('Credential creation returned null');
      }
      
      console.log('✅ N8N credential created:', credentialId);
      
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
      
      console.log('✅ Setup completed successfully');
      
      return NextResponse.json({
        success: true,
        message: 'Database setup completed successfully',
        credentialId,
      });
      
    } catch (credError) {
      console.error('❌ N8N credential creation failed:', credError);
      
      await db.user.update({
        where: { id: user.id },
        data: {
          postgresSchemaInitialized: true,
          postgresSetupError: `Credential creation failed: ${(credError as Error).message}`,
          updatedAt: new Date(),
        },
      });
      
      return NextResponse.json(
        { 
          error: 'Schema created but credential creation failed', 
          details: (credError as Error).message 
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('💥 Unexpected error in setup:', error);
    return NextResponse.json(
      { 
        error: 'Unexpected error during setup', 
        details: (error as Error).message,
        stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * 🔧 แก้ไข: ใช้ Secret Groups API เพื่อดึง DATABASE_URL
 */
/**
 * 🔧 แก้ไข: ใช้ Secret Groups API เพื่อดึง DATABASE_URL
 */
async function getPostgresConnection(projectId: string) {
  try {
    console.log('📝 Getting Postgres connection from secret groups...');

    // ========================================
    // STEP 1: List Secret Groups
    // ========================================
    const secretGroupsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/secret-groups`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!secretGroupsResponse.ok) {
      const errorText = await secretGroupsResponse.text();
      console.error('❌ Failed to list secret groups:', secretGroupsResponse.status, errorText);
      return null;
    }

    const secretGroupsData = await secretGroupsResponse.json();
    console.log('📦 Found', secretGroupsData.data?.secretGroups?.length || 0, 'secret groups');

    // ========================================
    // STEP 2: Find database secret group
    // ========================================
    let databaseSecretGroup = null;
    const secretGroups = secretGroupsData.data?.secretGroups || [];

    for (const group of secretGroups) {
      const groupName = (group.name || '').toLowerCase();
      if (groupName.includes('database') || groupName.includes('postgres') || groupName.includes('db')) {
        databaseSecretGroup = group;
        console.log('✅ Found database secret group:', group.name);
        break;
      }
    }

    if (!databaseSecretGroup && secretGroups.length > 0) {
      databaseSecretGroup = secretGroups[0];
      console.log('⚠️ Using first secret group:', databaseSecretGroup.name);
    }

    if (!databaseSecretGroup) {
      console.error('❌ No secret group found');
      return null;
    }

    // ========================================
    // ✅ STEP 3 (PATCHED): Get Secret Values
    // ========================================
    console.log('📝 Getting secrets from group:', databaseSecretGroup.id);

    const secretsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/secret-groups/${databaseSecretGroup.id}/secrets`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!secretsResponse.ok) {
      const errorText = await secretsResponse.text();
      console.error('❌ Failed to get secret values:', secretsResponse.status, errorText);
      return null;
    }

    const secretsJson = await secretsResponse.json();
    const secrets = secretsJson.data?.secrets || {};

    console.log('📦 Available secrets:', Object.keys(secrets));

    // ========================================
    // STEP 4: Extract Connection Info
    // ========================================
    let connectionString =
      secrets.DATABASE_URL?.value ||
      secrets.POSTGRES_URL?.value ||
      secrets.DB_URL?.value ||
      secrets.CONNECTION_STRING?.value;

    if (connectionString) {
      console.log('✅ Found connection string in secrets');
      const parsed = parsePostgresUrl(connectionString);
      if (parsed) {
        return {
          connectionString,
          config: parsed,
        };
      }
    }

    const host = secrets.DB_HOST?.value || secrets.POSTGRES_HOST?.value || secrets.HOST?.value;
    const port = secrets.DB_PORT?.value || secrets.POSTGRES_PORT?.value || secrets.PORT?.value || '5432';
    const database = secrets.DB_NAME?.value || secrets.POSTGRES_DB?.value || secrets.DATABASE?.value;
    const user = secrets.DB_USER?.value || secrets.POSTGRES_USER?.value || secrets.USER?.value;
    const password = secrets.DB_PASSWORD?.value || secrets.POSTGRES_PASSWORD?.value || secrets.PASSWORD?.value;

    if (host && user && password && database) {
      console.log('✅ Found connection details in separate fields');
      connectionString = `postgresql://${user}:${password}@${host}:${port}/${database}?sslmode=require`;
      return {
        connectionString,
        config: {
          host,
          port: parseInt(String(port), 10),
          database,
          user,
          password,
        },
      };
    }

    console.error('❌ No valid connection info found in secrets');
    console.log('Available secret keys:', Object.keys(secrets));
    return null;
  } catch (error) {
    console.error('💥 Error getting Postgres connection:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return null;
  }
}
