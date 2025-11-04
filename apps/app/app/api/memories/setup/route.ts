// apps/app/app/api/memories/setup/route.ts - SCHEMA INITIALIZATION
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Memory setup started');
    
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      console.error('❌ Unauthorized');
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
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    console.log('✅ User found:', {
      projectStatus: user.northflankProjectStatus,
      schemaInitialized: user.postgresSchemaInitialized,
      hasCredential: !!user.n8nPostgresCredentialId,
    });
    
    // Already initialized
    if (user.postgresSchemaInitialized && user.n8nPostgresCredentialId) {
      console.log('ℹ️ Already initialized');
      return NextResponse.json({
        success: true,
        message: 'Database already initialized',
        credentialId: user.n8nPostgresCredentialId,
      });
    }
    
    // Validation
    if (!user.northflankProjectId) {
      return NextResponse.json(
        { error: 'No Northflank project found' },
        { status: 400 }
      );
    }
    
    if (user.northflankProjectStatus !== 'ready') {
      return NextResponse.json(
        { error: `Project not ready: ${user.northflankProjectStatus}` },
        { status: 400 }
      );
    }
    
    if (!user.n8nUrl || !user.n8nEncryptionKey) {
      return NextResponse.json(
        { error: 'N8N configuration missing' },
        { status: 400 }
      );
    }
    
    console.log('✅ Prerequisites validated');
    
    // Get Postgres connection
    console.log('📝 Getting Postgres connection...');
    const postgresConnection = await getPostgresConnection(user.northflankProjectId);
    
    if (!postgresConnection) {
      return NextResponse.json(
        { error: 'Failed to connect to Postgres' },
        { status: 500 }
      );
    }
    
    console.log('✅ Postgres connection retrieved');
    
    // Initialize schema
    console.log('📝 Initializing schema...');
    
    try {
      const { initializeUserPostgresSchema } = await import('@/lib/postgres-setup');
      
      const schemaSuccess = await initializeUserPostgresSchema(
        postgresConnection.connectionString,
        postgresConnection.adminConnectionString
      );
      
      if (!schemaSuccess) {
        throw new Error('Schema initialization failed');
      }
      
      console.log('✅ Schema initialized');
    } catch (schemaError) {
      console.error('❌ Schema error:', schemaError);
      
      await db.user.update({
        where: { id: user.id },
        data: {
          postgresSetupError: `Schema: ${(schemaError as Error).message}`,
          updatedAt: new Date(),
        },
      });
      
      return NextResponse.json(
        { error: 'Schema initialization failed', details: (schemaError as Error).message },
        { status: 500 }
      );
    }
    
    // Create N8N credential
    console.log('📝 Creating N8N credential...');
    
    try {
      const { createPostgresCredentialInN8n } = await import('@/lib/n8n-credentials');
      
      const n8nEmail = user.n8nUserEmail || user.email;
      const n8nPassword = `7On${user.n8nEncryptionKey}`;
      
      if (!postgresConnection.config) {
        throw new Error('Missing Postgres config');
      }
      
      const credentialId = await createPostgresCredentialInN8n({
        n8nUrl: user.n8nUrl,
        n8nEmail,
        n8nPassword,
        postgresConfig: postgresConnection.config,
      });
      
      if (!credentialId) {
        throw new Error('No credential ID returned');
      }
      
      console.log('✅ N8N credential created:', credentialId);
      
      // Update database
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
      
      console.log('✅ Setup completed');
      
      return NextResponse.json({
        success: true,
        message: 'Database setup completed',
        credentialId,
      });
      
    } catch (credError) {
      console.error('❌ Credential error:', credError);
      
      await db.user.update({
        where: { id: user.id },
        data: {
          postgresSchemaInitialized: true,
          postgresSetupError: `Credential: ${(credError as Error).message}`,
          updatedAt: new Date(),
        },
      });
      
      return NextResponse.json(
        { error: 'Credential creation failed', details: (credError as Error).message },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('💥 Unexpected error:', error);
    return NextResponse.json(
      { 
        error: 'Unexpected error', 
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

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
    
    const addonsData = await addonsResponse.json();
    const addons = addonsData.data?.addons || [];
    const postgresAddon = addons.find((a: any) => a.spec?.type === 'postgresql');
    
    if (!postgresAddon) return null;
    
    // Enable external access if needed
    if (!postgresAddon.spec?.externalAccessEnabled) {
      await fetch(
        `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ spec: { externalAccessEnabled: true } }),
        }
      );
      
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
    
    // Resume if paused
    if (postgresAddon.status === 'paused') {
      await fetch(
        `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}/resume`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
    if (postgresAddon.status !== 'running') return null;
    
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
    const envs = credentials.data?.envs;
    
    const adminConnectionString = envs?.EXTERNAL_POSTGRES_URI_ADMIN || envs?.POSTGRES_URI_ADMIN;
    const connectionString = envs?.EXTERNAL_POSTGRES_URI || envs?.POSTGRES_URI;
    
    if (!connectionString) return null;
    
    const parsed = parsePostgresUrl(connectionString);
    if (!parsed) return null;
    
    return {
      connectionString,
      adminConnectionString: adminConnectionString || connectionString,
      config: parsed,
    };
    
  } catch (error) {
    console.error('Error getting connection:', error);
    return null;
  }
}

function parsePostgresUrl(url: string) {
  try {
    const regex = /postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/;
    const match = url.match(regex);
    if (!match) return null;
    
    const [, user, password, host, port, database] = match;
    
    return { host, port: parseInt(port), database, user, password };
  } catch {
    return null;
  }
}