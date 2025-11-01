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
    
    // Step 1: Auth check
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      console.error('❌ Unauthorized - no clerk user');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log('✅ Clerk user authenticated:', clerkUserId);
    
    // Step 2: Get user
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
    
    // Step 3: Check if already initialized
    if (user.postgresSchemaInitialized && user.n8nPostgresCredentialId) {
      console.log('ℹ️ Database already initialized');
      return NextResponse.json({
        success: true,
        message: 'Database already initialized',
        credentialId: user.n8nPostgresCredentialId,
      });
    }
    
    // Step 4: Validate prerequisites
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
    
    // Step 5: Get Postgres connection
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
    
    // Step 6: Initialize schema
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
    
    // Step 7: Create N8N credential
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
      
      // Step 8: Update database
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
      
      // Schema was created, but credential failed
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
 * Helper: Get Postgres connection from Northflank
 */
async function getPostgresConnection(projectId: string) {
  try {
    console.log('📝 Getting Postgres addon for project:', projectId);
    
    // Step 1: List addons
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
      const errorText = await addonsResponse.text();
      console.error('❌ Failed to list addons:', addonsResponse.status, errorText);
      return null;
    }
    
    const addonsData = await addonsResponse.json();
    console.log('📦 Addons response structure:', JSON.stringify(addonsData, null, 2).substring(0, 500));
    
    // Check if data exists and is an array
    if (!addonsData.data) {
      console.error('❌ No data field in addons response');
      return null;
    }
    
    if (!Array.isArray(addonsData.data)) {
      console.error('❌ addons.data is not an array:', typeof addonsData.data);
      console.log('Actual data:', addonsData.data);
      return null;
    }
    
    console.log('✅ Found', addonsData.data.length, 'addons');
    
    // Find Postgres addon
    const postgresAddon = addonsData.data.find((addon: any) => {
      console.log('Checking addon:', {
        id: addon.id,
        name: addon.name,
        type: addon.spec?.type,
      });
      return addon.spec?.type === 'postgresql';
    });
    
    if (!postgresAddon) {
      console.error('❌ No Postgres addon found in project');
      console.log('Available addons:', addonsData.data.map((a: any) => ({
        id: a.id,
        type: a.spec?.type,
      })));
      return null;
    }
    
    console.log('✅ Postgres addon found:', {
      id: postgresAddon.id,
      name: postgresAddon.name,
    });
    
    // Step 2: Get connection details
    console.log('📝 Getting connection details for addon:', postgresAddon.id);
    
    const connectionResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!connectionResponse.ok) {
      const errorText = await connectionResponse.text();
      console.error('❌ Failed to get addon details:', connectionResponse.status, errorText);
      return null;
    }
    
    const details = await connectionResponse.json();
    console.log('📦 Connection details structure:', JSON.stringify(details, null, 2).substring(0, 500));
    
    const connection = details.data?.connection;
    
    if (!connection) {
      console.error('❌ No connection object in addon details');
      console.log('Available fields:', Object.keys(details.data || {}));
      return null;
    }
    
    // Validate connection fields
    const requiredFields = ['host', 'port', 'database', 'user', 'password', 'connectionString'];
    const missingFields = requiredFields.filter(field => !connection[field]);
    
    if (missingFields.length > 0) {
      console.error('❌ Missing connection fields:', missingFields);
      console.log('Available connection fields:', Object.keys(connection));
      return null;
    }
    
    console.log('✅ Connection details validated:', {
      host: connection.host,
      port: connection.port,
      database: connection.database,
      user: connection.user,
      hasPassword: !!connection.password,
      hasConnectionString: !!connection.connectionString,
    });
    
    return {
      connectionString: connection.connectionString,
      config: {
        host: connection.host,
        port: parseInt(connection.port || '5432', 10),
        database: connection.database,
        user: connection.user,
        password: connection.password,
      },
    };
  } catch (error) {
    console.error('💥 Error getting Postgres connection:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
    return null;
  }
}