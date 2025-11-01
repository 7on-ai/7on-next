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
 * ใช้ External Networks API เพื่อดึง connection details
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
    
    // Validate and extract array
    let addonsList = addonsData.data;
    
    if (!Array.isArray(addonsList)) {
      if (addonsList?.addons && Array.isArray(addonsList.addons)) {
        addonsList = addonsList.addons;
      } else if (addonsList?.items && Array.isArray(addonsList.items)) {
        addonsList = addonsList.items;
      } else {
        console.error('❌ Cannot find addons array in response');
        return null;
      }
    }
    
    console.log('✅ Found', addonsList.length, 'addons');
    
    // ========================================
    // STEP 2: Find Postgres addon
    // ========================================
    const postgresAddon = addonsList.find((addon: any) => {
      const addonType = addon.spec?.type || addon.type;
      return addonType === 'postgresql';
    });
    
    if (!postgresAddon) {
      console.error('❌ No Postgres addon found');
      console.log('Available addons:', addonsList.map((a: any) => ({
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
    // STEP 3: Get connection via External Networks
    // 🔧 FIX: ใช้ /external-networks endpoint แทน
    // ========================================
    console.log('📝 Getting connection via external networks...');
    
    const networksResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}/external-networks`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!networksResponse.ok) {
      const errorText = await networksResponse.text();
      console.error('❌ Failed to get external networks:', networksResponse.status, errorText);
      return null;
    }
    
    const networksData = await networksResponse.json();
    console.log('📦 Networks response:', JSON.stringify(networksData, null, 2).substring(0, 500));
    
    // Extract connection details
    let connection = null;
    
    // Try different paths
    if (networksData.data?.connection) {
      connection = networksData.data.connection;
    } else if (networksData.connection) {
      connection = networksData.connection;
    } else if (networksData.data?.externalNetworks?.[0]) {
      connection = networksData.data.externalNetworks[0];
    } else if (Array.isArray(networksData.data) && networksData.data[0]) {
      connection = networksData.data[0];
    }
    
    if (!connection) {
      console.error('❌ No connection details found in networks response');
      console.log('Available fields:', Object.keys(networksData));
      if (networksData.data) {
        console.log('Data fields:', Object.keys(networksData.data));
      }
      return null;
    }
    
    console.log('📦 Connection object:', JSON.stringify(connection, null, 2).substring(0, 500));
    
    // Extract connection details (various possible structures)
    const host = connection.host || connection.hostname || connection.address;
    const port = connection.port || 5432;
    const database = connection.database || connection.databaseName || postgresAddon.name;
    const user = connection.user || connection.username;
    const password = connection.password;
    
    if (!host || !user || !password) {
      console.error('❌ Missing essential connection fields');
      console.log('Connection details:', { 
        hasHost: !!host, 
        hasUser: !!user, 
        hasPassword: !!password,
        hasDatabase: !!database,
      });
      return null;
    }
    
    const connectionString = connection.connectionString || 
      `postgresql://${user}:${password}@${host}:${port}/${database}?sslmode=require`;
    
    console.log('✅ Connection details validated:', {
      host,
      port,
      database,
      user,
      hasPassword: !!password,
    });
    
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
  } catch (error) {
    console.error('💥 Error getting Postgres connection:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return null;
  }
}