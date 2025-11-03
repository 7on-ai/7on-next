// apps/app/app/api/memories/setup/route.ts - FINAL FIX
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;

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
    
    console.log('📝 Getting Postgres connection...');
    const postgresConnection = await getPostgresConnection(user.northflankProjectId);
    
    if (!postgresConnection) {
      console.error('❌ Failed to get Postgres connection');
      return NextResponse.json(
        { error: 'Failed to connect to Postgres database. Please try again in a moment.' },
        { status: 500 }
      );
    }
    
    console.log('✅ Postgres connection retrieved');
    console.log('Connection types:', {
      hasRegular: !!postgresConnection.connectionString,
      hasAdmin: !!postgresConnection.adminConnectionString,
      willUseAdmin: postgresConnection.adminConnectionString !== postgresConnection.connectionString,
    });
    
    console.log('📝 Initializing schema with admin credentials...');
    
    try {
      const { initializeUserPostgresSchema } = await import('@/lib/postgres-setup');
      
      // ✅ CRITICAL: Pass admin connection string as SECOND parameter
      const schemaSuccess = await initializeUserPostgresSchema(
        postgresConnection.connectionString,      // Regular user connection
        postgresConnection.adminConnectionString  // Admin connection for schema creation
      );
      
      if (!schemaSuccess) {
        throw new Error('Schema initialization returned false');
      }
      
      console.log('✅ Schema initialized successfully');
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
    
    console.log('📝 Creating N8N credential with regular user...');
    
    try {
      const { createPostgresCredentialInN8n } = await import('@/lib/n8n-credentials');
      
      const n8nEmail = user.n8nUserEmail || user.email;
      const n8nPassword = `7On${user.n8nEncryptionKey}`;
      
      console.log('N8N config:', {
        url: user.n8nUrl,
        email: n8nEmail,
        hasPassword: !!n8nPassword,
      });
      
      // ✅ Use regular user credentials for N8N (not admin)
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

async function getPostgresConnection(projectId: string) {
  try {
    console.log('📝 Getting Postgres connection from Northflank Addons API...');
    
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
    console.log('📦 Found', addonsData.data?.addons?.length || 0, 'addons');
    
    const addons = addonsData.data?.addons || [];
    const postgresAddon = addons.find(
      (addon: any) => addon.spec?.type === 'postgresql'
    );
    
    if (!postgresAddon) {
      console.error('❌ No PostgreSQL addon found in project');
      return null;
    }
    
    console.log('✅ PostgreSQL addon found:', {
      id: postgresAddon.id,
      name: postgresAddon.name,
      status: postgresAddon.status,
      externalAccessEnabled: postgresAddon.spec?.externalAccessEnabled,
    });
    
    // Enable external access if not enabled
    if (!postgresAddon.spec?.externalAccessEnabled) {
      console.log('⚠️ External access not enabled, enabling now...');
      
      try {
        const patchResponse = await fetch(
          `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              spec: {
                externalAccessEnabled: true,
              },
            }),
          }
        );
        
        if (!patchResponse.ok) {
          const errorText = await patchResponse.text();
          console.error('❌ Failed to enable external access:', errorText);
          return null;
        }
        
        console.log('✅ External access enabled, waiting 15 seconds for DNS propagation...');
        await new Promise(resolve => setTimeout(resolve, 15000));
      } catch (patchError) {
        console.error('❌ Error enabling external access:', patchError);
        return null;
      }
    }
    
    if (postgresAddon.status === 'paused') {
      console.log('⏸️ PostgreSQL addon is paused, attempting to resume...');
      
      try {
        const resumeResponse = await fetch(
          `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}/resume`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        if (resumeResponse.ok) {
          console.log('✅ PostgreSQL addon resume initiated');
          console.log('⏳ Waiting 30 seconds for database to start...');
          await new Promise(resolve => setTimeout(resolve, 30000));
        } else {
          const errorText = await resumeResponse.text();
          console.error('❌ Failed to resume addon:', resumeResponse.status, errorText);
          return null;
        }
      } catch (resumeError) {
        console.error('💥 Error resuming addon:', resumeError);
        return null;
      }
    } else if (postgresAddon.status !== 'running') {
      console.error('❌ PostgreSQL addon is not running:', postgresAddon.status);
      return null;
    }
    
    console.log('📝 Getting PostgreSQL addon credentials...');
    
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
      const errorText = await credentialsResponse.text();
      console.error('❌ Failed to get addon credentials:', credentialsResponse.status, errorText);
      return null;
    }
    
    const credentials = await credentialsResponse.json();
    const envs = credentials.data?.envs;
    
    console.log('Available envs:', Object.keys(envs || {}));
    
    // ✅ Get both admin and regular connection strings
    const adminConnectionString = 
      envs?.EXTERNAL_POSTGRES_URI_ADMIN || 
      envs?.POSTGRES_URI_ADMIN;
    
    const connectionString = 
      envs?.EXTERNAL_POSTGRES_URI || 
      envs?.POSTGRES_URI;
    
    if (!connectionString) {
      console.error('❌ No connection string found');
      return null;
    }
    
    if (!adminConnectionString) {
      console.warn('⚠️ No admin connection string found, will use regular credentials');
    } else {
      console.log('✅ Both regular and admin connection strings retrieved');
    }
    
    const parsed = parsePostgresUrl(connectionString);
    
    if (!parsed) {
      console.error('❌ Failed to parse connection string');
      return null;
    }
    
    return {
      connectionString,
      adminConnectionString: adminConnectionString || connectionString,
      config: parsed,
    };
    
  } catch (error) {
    console.error('💥 Error getting Postgres connection:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return null;
  }
}

function parsePostgresUrl(url: string) {
  try {
    const regex = /postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/;
    const match = url.match(regex);
    
    if (!match) {
      console.warn('⚠️ Could not parse connection string');
      return null;
    }
    
    const [, user, password, host, port, database] = match;
    
    return {
      host,
      port: parseInt(port, 10),
      database,
      user,
      password,
    };
  } catch (error) {
    console.error('❌ Error parsing URL:', error);
    return null;
  }
}