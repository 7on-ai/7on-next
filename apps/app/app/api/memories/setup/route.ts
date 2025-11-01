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
 * 🔧 แก้ไข: Helper function สำหรับ Get Postgres connection
 */
async function getPostgresConnection(projectId: string) {
  try {
    console.log('📝 Getting Postgres addon for project:', projectId);
    
    // ========================================
    // STEP 1: List all addons
    // ========================================
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
    
    // ========================================
    // 🔧 FIX: Validate response structure
    // ========================================
    console.log('📦 Raw API response type:', typeof addonsData);
    console.log('📦 Has data field:', 'data' in addonsData);
    console.log('📦 Data type:', addonsData.data ? typeof addonsData.data : 'undefined');
    
    // ตรวจสอบว่า data field มีอยู่
    if (!addonsData.data) {
      console.error('❌ No data field in addons response');
      console.log('Available fields:', Object.keys(addonsData));
      return null;
    }
    
    // ตรวจสอบว่า data เป็น array
    if (!Array.isArray(addonsData.data)) {
      console.error('❌ addons.data is not an array:', typeof addonsData.data);
      console.log('Data content:', JSON.stringify(addonsData.data).substring(0, 200));
      
      // 🔧 FIX: ถ้าเป็น object ที่มี nested array
      if (typeof addonsData.data === 'object' && addonsData.data.items && Array.isArray(addonsData.data.items)) {
        console.log('⚠️ Found nested items array, using it instead');
        addonsData.data = addonsData.data.items;
      } else if (typeof addonsData.data === 'object' && addonsData.data.addons && Array.isArray(addonsData.data.addons)) {
        console.log('⚠️ Found nested addons array, using it instead');
        addonsData.data = addonsData.data.addons;
      } else {
        return null;
      }
    }
    
    console.log('✅ Found', addonsData.data.length, 'addons');
    
    // ========================================
    // STEP 2: Find Postgres addon
    // ========================================
    const postgresAddon = addonsData.data.find((addon: any) => {
      const addonType = addon.spec?.type || addon.type;
      console.log('Checking addon:', {
        id: addon.id,
        name: addon.name,
        type: addonType,
      });
      return addonType === 'postgresql';
    });
    
    if (!postgresAddon) {
      console.error('❌ No Postgres addon found in project');
      console.log('Available addons:', addonsData.data.map((a: any) => ({
        id: a.id,
        name: a.name,
        type: a.spec?.type || a.type,
      })));
      return null;
    }
    
    console.log('✅ Postgres addon found:', {
      id: postgresAddon.id,
      name: postgresAddon.name,
    });
    
    // ========================================
    // STEP 3: Get connection details
    // ========================================
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
    
    // ตรวจสอบ structure
    const connection = details.data?.connection || details.connection;
    
    if (!connection) {
      console.error('❌ No connection object in addon details');
      console.log('Available fields in details:', Object.keys(details));
      if (details.data) {
        console.log('Available fields in details.data:', Object.keys(details.data));
      }
      return null;
    }
    
    // Validate required fields
    const requiredFields = ['host', 'port', 'database', 'user', 'password'];
    const missingFields = requiredFields.filter(field => !connection[field]);
    
    if (missingFields.length > 0) {
      console.error('❌ Missing connection fields:', missingFields);
      console.log('Available connection fields:', Object.keys(connection));
      return null;
    }
    
    // ตรวจสอบ connection string
    const connectionString = connection.connectionString || 
      `postgresql://${connection.user}:${connection.password}@${connection.host}:${connection.port}/${connection.database}`;
    
    console.log('✅ Connection details validated:', {
      host: connection.host,
      port: connection.port,
      database: connection.database,
      user: connection.user,
      hasPassword: !!connection.password,
      hasConnectionString: !!connectionString,
    });
    
    return {
      connectionString,
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
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return null;
  }
}