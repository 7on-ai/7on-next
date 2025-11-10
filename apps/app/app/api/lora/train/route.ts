// apps/app/app/api/lora/train/route.ts
// ✅ FIXED: Use EXTERNAL URL because Vercel cannot reach Northflank internal network

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;
const OLLAMA_PROJECT_ID = process.env.OLLAMA_PROJECT_ID!;

// ✅ CRITICAL FIX: Vercel needs EXTERNAL URL (not internal)
// Get from Northflank: Services → Ollama → Ports → Public URL
const OLLAMA_EXTERNAL_URL = process.env.OLLAMA_TRAINING_URL || 
  'https://train--ollama--fppvxj4w99rz.code.run'; // Your public URL from screenshot

console.log('🔗 Ollama Training URL:', OLLAMA_EXTERNAL_URL);

// ===== POST: Start Training =====
export async function POST(request: NextRequest) {
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
        loraTrainingStatus: true,
        goodChannelCount: true,
        badChannelCount: true,
        mclChainCount: true,
      },
    });

    if (!user?.northflankProjectId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 400 });
    }

    if (user.loraTrainingStatus === 'training') {
      return NextResponse.json({
        error: 'Training already in progress',
        status: 'training',
      }, { status: 409 });
    }

    const totalData = user.goodChannelCount + user.badChannelCount + user.mclChainCount;
    
    if (totalData < 10) {
      return NextResponse.json({
        error: 'Not enough training data (need at least 10 samples)',
        current: totalData,
      }, { status: 400 });
    }

    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    
    if (!connectionString) {
      throw new Error('Cannot get database connection');
    }

    // ✅ Check Ollama health BEFORE starting
    console.log('🏥 Checking Ollama service health...');
    const healthCheck = await checkOllamaHealth();
    
    if (!healthCheck.healthy) {
      console.error('❌ Ollama not ready:', healthCheck.error);
      
      return NextResponse.json({
        error: 'Training service not available',
        details: healthCheck.error,
        suggestion: healthCheck.suggestion,
      }, { status: 503 });
    }

    console.log('✅ Ollama service is healthy');

    console.log('📝 Auto-approving data...');
    await autoApproveData(connectionString, user.id);

    const adapterVersion = `v${Date.now()}`;
    const trainingId = `train-${user.id.slice(0, 8)}-${adapterVersion}`;

    console.log(`🚀 Starting training: ${trainingId}`);

    await db.user.update({
      where: { id: user.id },
      data: {
        loraTrainingStatus: 'training',
        loraAdapterVersion: adapterVersion,
        loraTrainingError: null,
        updatedAt: new Date(),
      },
    });

    await logTrainingJob(connectionString, {
      userId: user.id,
      jobId: trainingId,
      jobName: trainingId,
      adapterVersion,
      datasetComposition: {
        good: user.goodChannelCount,
        bad: user.badChannelCount,
        mcl: user.mclChainCount,
      },
      totalSamples: totalData,
    });

    // ✅ Call Ollama training endpoint with EXTERNAL URL
    console.log(`📤 Sending request to: ${OLLAMA_EXTERNAL_URL}/api/train`);
    
    try {
      const trainingResponse = await fetch(`${OLLAMA_EXTERNAL_URL}/api/train`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id,
          adapter_version: adapterVersion,
          training_id: trainingId,
          postgres_uri: connectionString,
          base_model: 'mistral',
          output_dir: `/models/adapters/${user.id}/${adapterVersion}`,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!trainingResponse.ok) {
        const errorText = await trainingResponse.text();
        console.error('❌ Training request failed:', {
          status: trainingResponse.status,
          statusText: trainingResponse.statusText,
          url: `${OLLAMA_EXTERNAL_URL}/api/train`,
          body: errorText.substring(0, 500),
        });
        
        throw new Error(`Training service error: ${trainingResponse.status} - ${errorText.substring(0, 200)}`);
      }

      const trainingData = await trainingResponse.json();
      console.log('✅ Training started:', trainingData);

      // Start monitoring
      monitorTrainingStatus(
        user.id,
        trainingId,
        adapterVersion,
        connectionString
      ).catch(console.error);

      return NextResponse.json({
        success: true,
        status: 'training',
        trainingId,
        adapterVersion,
        message: 'Training started successfully',
        estimatedTime: '10-30 minutes',
        stats: {
          good: user.goodChannelCount,
          bad: user.badChannelCount,
          mcl: user.mclChainCount,
          total: totalData,
        },
      });

    } catch (trainingError) {
      console.error('❌ Training start error:', trainingError);
      
      await db.user.update({
        where: { id: user.id },
        data: {
          loraTrainingStatus: 'failed',
          loraTrainingError: (trainingError as Error).message,
          updatedAt: new Date(),
        },
      });

      await updateTrainingJobStatus(connectionString, trainingId, {
        status: 'failed',
        errorMessage: (trainingError as Error).message,
        completedAt: new Date(),
      });

      throw trainingError;
    }

  } catch (error) {
    console.error('❌ Training API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== Helper: Check Ollama Health =====
async function checkOllamaHealth(): Promise<{ 
  healthy: boolean; 
  error?: string;
  suggestion?: string;
}> {
  try {
    console.log(`Checking: ${OLLAMA_EXTERNAL_URL}/health`);
    
    const response = await fetch(`${OLLAMA_EXTERNAL_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        healthy: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        suggestion: 'The training service is starting. Please wait 1-2 minutes and try again.',
      };
    }

    const data = await response.json();
    
    if (data.status !== 'healthy') {
      return {
        healthy: false,
        error: `Service status: ${data.status}`,
        suggestion: 'Training service is not fully ready. Please wait and retry.',
      };
    }

    return { healthy: true };
    
  } catch (error) {
    const err = error as Error;
    
    // Network errors
    if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
      return {
        healthy: false,
        error: 'Cannot reach training service (DNS error)',
        suggestion: 'Make sure external access is enabled in Northflank service settings.',
      };
    }
    
    if (err.message.includes('ETIMEDOUT') || err.message.includes('timeout')) {
      return {
        healthy: false,
        error: 'Training service timeout',
        suggestion: 'Service is starting or overloaded. Wait 1-2 minutes and try again.',
      };
    }
    
    if (err.message.includes('ECONNREFUSED')) {
      return {
        healthy: false,
        error: 'Connection refused',
        suggestion: 'Training service is not running. Please check Northflank service status.',
      };
    }

    return {
      healthy: false,
      error: err.message,
      suggestion: 'Please check Northflank logs for more details.',
    };
  }
}

// ===== GET: Status =====
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
      select: {
        loraTrainingStatus: true,
        loraAdapterVersion: true,
        loraLastTrainedAt: true,
        loraTrainingError: true,
        goodChannelCount: true,
        badChannelCount: true,
        mclChainCount: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      status: user.loraTrainingStatus || 'idle',
      currentVersion: user.loraAdapterVersion,
      lastTrainedAt: user.loraLastTrainedAt,
      error: user.loraTrainingError,
      stats: {
        goodChannel: user.goodChannelCount,
        badChannel: user.badChannelCount,
        mclChains: user.mclChainCount,
        total: user.goodChannelCount + user.badChannelCount + user.mclChainCount,
      },
    });

  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== DELETE: Cancel =====
export async function DELETE(request: NextRequest) {
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
        loraTrainingStatus: true,
      },
    });

    if (!user || user.loraTrainingStatus !== 'training') {
      return NextResponse.json({ 
        error: 'No training in progress',
      }, { status: 400 });
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        loraTrainingStatus: 'cancelled',
        loraTrainingError: 'Cancelled by user',
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Training cancelled',
    });

  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== Helper Functions =====

async function autoApproveData(connectionString: string, userId: string) {
  const { Client } = require('pg');
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    await client.query(`
      UPDATE user_data_schema.stm_good 
      SET approved_for_consolidation = TRUE 
      WHERE user_id = $1 AND approved_for_consolidation = FALSE
    `, [userId]);
    
    await client.query(`
      UPDATE user_data_schema.stm_bad 
      SET approved_for_shadow_learning = TRUE 
      WHERE user_id = $1 AND approved_for_shadow_learning = FALSE
    `, [userId]);
    
    await client.query(`
      UPDATE user_data_schema.mcl_chains 
      SET approved_for_training = TRUE 
      WHERE user_id = $1 AND approved_for_training = FALSE
    `, [userId]);
    
    console.log('✅ Data auto-approved');
    
  } finally {
    await client.end();
  }
}

async function monitorTrainingStatus(
  userId: string,
  trainingId: string,
  adapterVersion: string,
  connectionString: string
) {
  console.log(`🔍 Monitoring: ${trainingId}`);
  
  const maxAttempts = 60;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 30000));
    attempts++;
    
    try {
      const statusResponse = await fetch(
        `${OLLAMA_EXTERNAL_URL}/api/train/status/${trainingId}`,
        {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!statusResponse.ok) continue;

      const statusData = await statusResponse.json();
      
      if (statusData.status === 'completed' || statusData.status === 'success') {
        await db.user.update({
          where: { id: userId },
          data: {
            loraTrainingStatus: 'completed',
            loraLastTrainedAt: new Date(),
            loraTrainingError: null,
          },
        });
        break;
      }
      
      if (statusData.status === 'failed') {
        await db.user.update({
          where: { id: userId },
          data: {
            loraTrainingStatus: 'failed',
            loraTrainingError: statusData.error || 'Training failed',
          },
        });
        break;
      }
      
    } catch (error) {
      console.error('Monitoring error:', error);
    }
  }
}

async function logTrainingJob(connectionString: string, data: any) {
  const { Client } = require('pg');
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    await client.query(`
      INSERT INTO user_data_schema.training_jobs 
        (user_id, job_id, job_name, adapter_version, status, dataset_composition, total_samples, started_at)
      VALUES ($1, $2, $3, $4, 'running', $5, $6, NOW())
    `, [
      data.userId, data.jobId, data.jobName, data.adapterVersion,
      JSON.stringify(data.datasetComposition), data.totalSamples,
    ]);
  } finally {
    await client.end();
  }
}

async function updateTrainingJobStatus(connectionString: string, jobId: string, update: any) {
  const { Client } = require('pg');
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    const setClauses: string[] = [];
    const values: any[] = [];
    let i = 1;
    
    if (update.status) {
      setClauses.push(`status = $${i++}`);
      values.push(update.status);
    }
    if (update.completedAt) {
      setClauses.push(`completed_at = $${i++}`);
      values.push(update.completedAt);
    }
    if (update.errorMessage) {
      setClauses.push(`error_message = $${i++}`);
      values.push(update.errorMessage);
    }
    
    values.push(jobId);
    
    await client.query(`
      UPDATE user_data_schema.training_jobs 
      SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE job_id = $${i}
    `, values);
  } finally {
    await client.end();
  }
}

async function getPostgresConnectionString(projectId: string): Promise<string | null> {
  try {
    const addonsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/addons`,
      { headers: { Authorization: `Bearer ${NORTHFLANK_API_TOKEN}` } }
    );

    if (!addonsResponse.ok) return null;

    const addonsData = await addonsResponse.json();
    const postgresAddon = addonsData.data?.addons?.find(
      (a: any) => a.spec?.type === 'postgresql'
    );

    if (!postgresAddon) return null;

    const credentialsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}/credentials`,
      { headers: { Authorization: `Bearer ${NORTHFLANK_API_TOKEN}` } }
    );

    if (!credentialsResponse.ok) return null;

    const credentials = await credentialsResponse.json();
    return credentials.data?.envs?.EXTERNAL_POSTGRES_URI || null;
    
  } catch (error) {
    return null;
  }
}