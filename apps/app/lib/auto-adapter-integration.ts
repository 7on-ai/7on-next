// apps/app/lib/auto-adapter-integration.ts
/**
 * Automatically integrate trained adapters with user's N8N
 * Assumes Volume already exists in Ollama project
 */

import { database as db } from '@repo/database';
import { Client } from 'pg';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;
const OLLAMA_PROJECT_ID = process.env.OLLAMA_PROJECT_ID!;
const OLLAMA_SERVICE_ID = process.env.OLLAMA_SERVICE_ID || 'ollama';

interface AdapterConfig {
  userId: string;
  adapterVersion: string;
  adapterPath: string;
  status: 'ready' | 'training' | 'failed';
  metadata?: any;
}

/**
 * ✅ Step 1: Verify Volume exists (one-time check)
 */
export async function verifyOllamaVolumeExists(): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.northflank.com/v1/projects/${OLLAMA_PROJECT_ID}/volumes`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('❌ Cannot fetch volumes');
      return false;
    }

    const data = await response.json();
    const volumes = data.data?.volumes || [];

    const adapterVolume = volumes.find((v: any) => 
      v.name === 'lora-adapters' || 
      v.spec?.name === 'lora-adapters'
    );

    if (adapterVolume) {
      console.log('✅ Volume "lora-adapters" exists');
      return true;
    }

    console.warn('⚠️  Volume "lora-adapters" NOT found');
    console.warn('Please create it manually in Northflank Dashboard');
    return false;

  } catch (error) {
    console.error('❌ Volume check error:', error);
    return false;
  }
}

/**
 * ✅ Step 2: Verify Volume is mounted to Ollama service
 */
export async function verifyVolumeMounted(): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.northflank.com/v1/projects/${OLLAMA_PROJECT_ID}/services/${OLLAMA_SERVICE_ID}`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('❌ Cannot fetch service config');
      return false;
    }

    const data = await response.json();
    const volumes = data.data?.spec?.volumes || [];

    const mounted = volumes.some((v: any) => 
      v.name === 'lora-adapters' && 
      v.mountPath === '/models/adapters'
    );

    if (mounted) {
      console.log('✅ Volume mounted at /models/adapters');
      return true;
    }

    console.warn('⚠️  Volume not mounted');
    console.warn('Please mount "lora-adapters" to /models/adapters');
    return false;

  } catch (error) {
    console.error('❌ Mount check error:', error);
    return false;
  }
}

/**
 * ✅ Step 3: Store adapter info in user's Postgres
 */
export async function storeAdapterInfo(
  connectionString: string,
  config: AdapterConfig
): Promise<boolean> {
  const client = new Client({ connectionString });

  try {
    await client.connect();

    // Create table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.lora_adapter_info (
        user_id TEXT PRIMARY KEY,
        adapter_version TEXT NOT NULL,
        adapter_path TEXT NOT NULL,
        status TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Upsert adapter info
    await client.query(`
      INSERT INTO user_data_schema.lora_adapter_info 
        (user_id, adapter_version, adapter_path, status, metadata, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        adapter_version = $2,
        adapter_path = $3,
        status = $4,
        metadata = $5,
        updated_at = NOW()
    `, [
      config.userId,
      config.adapterVersion,
      config.adapterPath,
      config.status,
      JSON.stringify(config.metadata || {}),
    ]);

    console.log(`✅ Adapter info stored in Postgres for user ${config.userId}`);
    return true;

  } catch (error) {
    console.error('❌ Postgres storage error:', error);
    return false;
  } finally {
    await client.end();
  }
}

/**
 * ✅ Step 4: Update N8N workflow to use adapter
 * (Optional - ถ้า user มี workflow template)
 */
export async function updateN8NWorkflow(
  n8nUrl: string,
  n8nEmail: string,
  n8nPassword: string,
  adapterPath: string
): Promise<boolean> {
  try {
    // Login to N8N
    const loginResponse = await fetch(`${n8nUrl}/rest/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: n8nEmail, password: n8nPassword }),
    });

    if (!loginResponse.ok) {
      console.error('❌ N8N login failed');
      return false;
    }

    const { data: { token } } = await loginResponse.json();

    // Update environment variable
    const updateResponse = await fetch(`${n8nUrl}/rest/variables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `n8n-auth=${token}`,
      },
      body: JSON.stringify({
        key: 'LORA_ADAPTER_PATH',
        value: adapterPath,
        type: 'string',
      }),
    });

    if (!updateResponse.ok) {
      console.warn('⚠️  N8N variable update failed (non-critical)');
      return false;
    }

    console.log('✅ N8N environment variable updated');
    return true;

  } catch (error) {
    console.error('❌ N8N update error:', error);
    return false;
  }
}

/**
 * ✅ Main function: Auto-integrate after training
 */
export async function autoIntegrateAdapter(
  userId: string,
  adapterVersion: string,
  connectionString: string
): Promise<{
  success: boolean;
  adapterPath: string;
  errors: string[];
}> {
  const errors: string[] = [];
  const adapterPath = `/models/adapters/${userId}/${adapterVersion}`;

  console.log(`🚀 Auto-integrating adapter for user ${userId}`);

  // Step 1: Verify Volume setup (warning only)
  const volumeExists = await verifyOllamaVolumeExists();
  if (!volumeExists) {
    errors.push('Volume not found - please create "lora-adapters" volume');
  }

  const volumeMounted = await verifyVolumeMounted();
  if (!volumeMounted) {
    errors.push('Volume not mounted - please mount to /models/adapters');
  }

  // Step 2: Store in Postgres (critical)
  const stored = await storeAdapterInfo(connectionString, {
    userId,
    adapterVersion,
    adapterPath,
    status: 'ready',
    metadata: {
      integrated_at: new Date().toISOString(),
      volume_checked: volumeExists && volumeMounted,
    },
  });

  if (!stored) {
    errors.push('Failed to store adapter info in Postgres');
    return { success: false, adapterPath, errors };
  }

  // Step 3: Update N8N (optional - best effort)
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        n8nUrl: true,
        n8nUserEmail: true,
        n8nEncryptionKey: true,
        email: true,
      },
    });

    if (user?.n8nUrl && user.n8nEncryptionKey) {
      const n8nEmail = user.n8nUserEmail || user.email;
      const n8nPassword = `7On${user.n8nEncryptionKey}`;

      await updateN8NWorkflow(
        user.n8nUrl,
        n8nEmail!,
        n8nPassword,
        adapterPath
      );
    }
  } catch (n8nError) {
    console.warn('⚠️  N8N update skipped (non-critical):', n8nError);
  }

  console.log(`✅ Adapter integrated: ${adapterPath}`);
  console.log(`Errors: ${errors.length}`);

  return {
    success: errors.length === 0,
    adapterPath,
    errors,
  };
}

/**
 * ✅ Health check: Verify everything is ready
 */
export async function healthCheckVolumeSetup(): Promise<{
  volumeExists: boolean;
  volumeMounted: boolean;
  ready: boolean;
  instructions: string[];
}> {
  const volumeExists = await verifyOllamaVolumeExists();
  const volumeMounted = await verifyVolumeMounted();
  const ready = volumeExists && volumeMounted;

  const instructions: string[] = [];

  if (!volumeExists) {
    instructions.push(
      '1. Go to Northflank Dashboard → Ollama Project → Volumes',
      '2. Create Volume: name="lora-adapters", size=50GB',
      '3. Save'
    );
  }

  if (!volumeMounted) {
    instructions.push(
      '1. Go to Ollama Service → Volumes tab',
      '2. Add Volume: lora-adapters → /models/adapters',
      '3. Save (service will restart)'
    );
  }

  if (ready) {
    instructions.push('✅ Everything is ready!');
  }

  return {
    volumeExists,
    volumeMounted,
    ready,
    instructions,
  };
}