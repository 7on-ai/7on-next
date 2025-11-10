// apps/app/app/api/lora/train/route.ts
// ✅ FIXED: Proper Ollama service connection + Better error handling
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;
const OLLAMA_PROJECT_ID = process.env.OLLAMA_PROJECT_ID!;

// ✅ FIX 1: Use INTERNAL URL (not external)
// Internal services in Northflank can talk via: http://SERVICE_ID--PROJECT_ID.code.run
const OLLAMA_SERVICE_ID = process.env.OLLAMA_SERVICE_ID || 'ollama';
const OLLAMA_INTERNAL_URL = `http://${OLLAMA_SERVICE_ID}--${OLLAMA_PROJECT_ID}.code.run`;

console.log('🔗 Ollama Training Endpoint:', OLLAMA_INTERNAL_URL);

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

    // 🚫 Check if already training
    if (user.loraTrainingStatus === 'training') {
      return NextResponse.json({
        error: 'Training already in progress',
        status: 'training',
      }, { status: 409 });
    }

    // 📊 Check if enough data
    const totalData = user.goodChannelCount + user.badChannelCount + user.mclChainCount;
    
    if (totalData < 10) {
      return NextResponse.json({
        error: 'Not enough training data (need at least 10 samples)',
        current: totalData,
      }, { status: 400 });
    }

    // 🔗 Get Postgres connection
    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    
    if (!connectionString) {
      throw new Error('Cannot get database connection');
    }

    // 📝 Auto-approve data before training
    console.log('📝 Auto-approving data...');
    await autoApproveData(connectionString, user.id);

    // 🎯 Generate adapter version
    const adapterVersion = `v${Date.now()}`;
    const trainingId = `train-${user.id.slice(0, 8)}-${adapterVersion}`;

    console.log(`🚀 Starting training: ${trainingId}`);

    // ✅ FIX 2: Check Ollama health BEFORE starting
    const healthCheck = await checkOllamaHealth();
    
    if (!healthCheck.healthy) {
      console.error('❌ Ollama service not ready:', healthCheck.error);
      
      return NextResponse.json({
        error: 'Training service not available',
        details: healthCheck.error,
        suggestion: 'Please wait a few minutes and try again. The training service may be starting up.',
      }, { status: 503 });
    }

    // ✅ Update status to training immediately
    await db.user.update({
      where: { id: user.id },
      data: {
        loraTrainingStatus: 'training',
        loraAdapterVersion: adapterVersion,
        loraTrainingError: null,
        updatedAt: new Date(),
      },
    });

    // 📝 Log training job to Postgres
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

    // 🚀 Call Ollama service training endpoint
    console.log(`📤 Sending training request to Ollama service...`);
    
    try {
      // ✅ FIX 3: Use internal URL with proper timeout
      const trainingResponse = await fetch(`${OLLAMA_INTERNAL_URL}:5000/api/train`, {
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
        signal: AbortSignal.timeout(30000), // 30s timeout
      });

      if (!trainingResponse.ok) {
        const errorText = await trainingResponse.text();
        console.error('❌ Ollama training request failed:', {
          status: trainingResponse.status,
          statusText: trainingResponse.statusText,
          body: errorText,
        });
        
        throw new Error(`Training service error: ${trainingResponse.status} - ${errorText}`);
      }

      const trainingData = await trainingResponse.json();
      console.log('✅ Training started on Ollama service:', trainingData);

      // 🔄 Start monitoring training status (async)
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
      
      // Revert status on error
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

// ===== GET: Check Status =====
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

// ===== DELETE: Cancel Training =====
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

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.loraTrainingStatus !== 'training') {
      return NextResponse.json({ 
        error: 'No training in progress',
        status: user.loraTrainingStatus 
      }, { status: 400 });
    }

    console.log(`🛑 Cancelling training for user ${user.id}`);

    await db.user.update({
      where: { id: user.id },
      data: {
        loraTrainingStatus: 'cancelled',
        loraTrainingError: 'Training cancelled by user',
        updatedAt: new Date(),
      },
    });

    const connectionString = await getPostgresConnectionString(user.northflankProjectId!);
    if (connectionString) {
      const { Client } = require('pg');
      const client = new Client({ connectionString });
      
      try {
        await client.connect();
        
        await client.query(`
          UPDATE user_data_schema.training_jobs 
          SET 
            status = 'cancelled',
            error_message = 'Cancelled by user',
            completed_at = NOW(),
            updated_at = NOW()
          WHERE id = (
            SELECT id 
            FROM user_data_schema.training_jobs
            WHERE user_id = $1 
              AND status = 'running'
            ORDER BY created_at DESC
            LIMIT 1
          )
        `, [user.id]);
        
      } finally {
        await client.end();
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Training cancelled',
      status: 'cancelled',
    });

  } catch (error) {
    console.error('❌ Cancel training error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== Helper Functions =====

// ✅ FIX 4: Add health check function
async function checkOllamaHealth(): Promise<{ healthy: boolean; error?: string }> {
  try {
    const response = await fetch(`${OLLAMA_INTERNAL_URL}:5000/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        healthy: false,
        error: `Service returned ${response.status}`,
      };
    }

    const data = await response.json();
    
    return {
      healthy: data.status === 'healthy',
      error: data.status !== 'healthy' ? 'Service not healthy' : undefined,
    };
  } catch (error) {
    console.error('Health check failed:', error);
    return {
      healthy: false,
      error: (error as Error).message,
    };
  }
}

async function autoApproveData(connectionString: string, userId: string) {
  const { Client } = require('pg');
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    await client.query(`
      UPDATE user_data_schema.stm_good 
      SET approved_for_consolidation = TRUE 
      WHERE user_id = $1 
        AND approved_for_consolidation = FALSE 
        AND alignment_score >= 0.7
    `, [userId]);
    
    await client.query(`
      UPDATE user_data_schema.stm_bad 
      SET approved_for_shadow_learning = TRUE 
      WHERE user_id = $1 
        AND approved_for_shadow_learning = FALSE 
        AND safe_counterfactual IS NOT NULL
    `, [userId]);
    
    await client.query(`
      UPDATE user_data_schema.mcl_chains 
      SET approved_for_training = TRUE 
      WHERE user_id = $1 
        AND approved_for_training = FALSE
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
  console.log(`🔍 Monitoring training ${trainingId}...`);
  
  const maxAttempts = 60;
  let attempts = 0;
  let consecutiveErrors = 0;
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 30000));
    attempts++;
    
    try {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { loraTrainingStatus: true },
      });

      if (!user || user.loraTrainingStatus === 'cancelled') {
        console.log('🛑 Training cancelled');
        break;
      }

      if (user.loraTrainingStatus === 'completed' || user.loraTrainingStatus === 'failed') {
        console.log(`ℹ️ Training already ${user.loraTrainingStatus}`);
        break;
      }

      const statusResponse = await fetch(
        `${OLLAMA_INTERNAL_URL}:5000/api/train/status/${trainingId}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!statusResponse.ok) {
        consecutiveErrors++;
        console.warn(`⚠️ Cannot get status (${consecutiveErrors}/10)`);
        
        if (consecutiveErrors >= 10) {
          await db.user.update({
            where: { id: userId },
            data: {
              loraTrainingStatus: 'failed',
              loraTrainingError: 'Training service not responding',
              updatedAt: new Date(),
            },
          });
          break;
        }
        continue;
      }

      consecutiveErrors = 0;
      const statusData = await statusResponse.json();
      const status = statusData.status;
      
      console.log(`📊 Training status: ${status}`);

      if (status === 'completed' || status === 'success') {
        await db.user.update({
          where: { id: userId },
          data: {
            loraTrainingStatus: 'completed',
            loraLastTrainedAt: new Date(),
            loraTrainingError: null,
            updatedAt: new Date(),
          },
        });

        await updateTrainingJobStatus(connectionString, trainingId, {
          status: 'completed',
          completedAt: new Date(),
          trainingLoss: statusData.final_loss,
        });
        
        break;
      } 
      else if (status === 'failed' || status === 'error') {
        await db.user.update({
          where: { id: userId },
          data: {
            loraTrainingStatus: 'failed',
            loraTrainingError: statusData.error || 'Training failed',
            updatedAt: new Date(),
          },
        });

        await updateTrainingJobStatus(connectionString, trainingId, {
          status: 'failed',
          errorMessage: statusData.error,
          completedAt: new Date(),
        });
        
        break;
      }
      
    } catch (error) {
      consecutiveErrors++;
      console.error(`❌ Monitoring error (${consecutiveErrors}/10):`, error);
      
      if (consecutiveErrors >= 10) {
        await db.user.update({
          where: { id: userId },
          data: {
            loraTrainingStatus: 'failed',
            loraTrainingError: 'Monitoring failed',
            updatedAt: new Date(),
          },
        });
        break;
      }
    }
  }
  
  if (attempts >= maxAttempts) {
    await db.user.update({
      where: { id: userId },
      data: {
        loraTrainingStatus: 'failed',
        loraTrainingError: 'Training timeout (30 minutes)',
        updatedAt: new Date(),
      },
    });
  }
}

async function logTrainingJob(
  connectionString: string,
  data: {
    userId: string;
    jobId: string;
    jobName: string;
    adapterVersion: string;
    datasetComposition: any;
    totalSamples: number;
  }
) {
  const { Client } = require('pg');
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    await client.query(`
      INSERT INTO user_data_schema.training_jobs 
        (user_id, job_id, job_name, adapter_version, status, dataset_composition, total_samples, started_at)
      VALUES ($1, $2, $3, $4, 'running', $5, $6, NOW())
    `, [
      data.userId,
      data.jobId,
      data.jobName,
      data.adapterVersion,
      JSON.stringify(data.datasetComposition),
      data.totalSamples,
    ]);
    
    console.log('✅ Training job logged');
    
  } finally {
    await client.end();
  }
}

async function updateTrainingJobStatus(
  connectionString: string,
  jobId: string,
  update: {
    status?: string;
    completedAt?: Date;
    trainingLoss?: number;
    errorMessage?: string;
  }
) {
  const { Client } = require('pg');
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (update.status) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(update.status);
    }
    
    if (update.completedAt) {
      setClauses.push(`completed_at = $${paramIndex++}`);
      values.push(update.completedAt);
    }
    
    if (update.trainingLoss) {
      setClauses.push(`training_loss = $${paramIndex++}`);
      values.push(update.trainingLoss);
    }
    
    if (update.errorMessage) {
      setClauses.push(`error_message = $${paramIndex++}`);
      values.push(update.errorMessage);
    }
    
    setClauses.push(`updated_at = NOW()`);
    values.push(jobId);
    
    await client.query(`
      UPDATE user_data_schema.training_jobs 
      SET ${setClauses.join(', ')}
      WHERE job_id = $${paramIndex}
    `, values);
    
  } finally {
    await client.end();
  }
}

async function getPostgresConnectionString(projectId: string): Promise<string | null> {
  try {
    const addonsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/addons`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
        },
      }
    );

    if (!addonsResponse.ok) return null;

    const addonsData = await addonsResponse.json();
    const postgresAddon = addonsData.data?.addons?.find(
      (a: any) => a.spec?.type === 'postgresql'
    );

    if (!postgresAddon) return null;

    const credentialsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/addons/${postgresAddon.id}/credentials`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
        },
      }
    );

    if (!credentialsResponse.ok) return null;

    const credentials = await credentialsResponse.json();
    
    return (
      credentials.data?.envs?.EXTERNAL_POSTGRES_URI ||
      credentials.data?.envs?.POSTGRES_URI ||
      null
    );
    
  } catch (error) {
    console.error('Error getting connection string:', error);
    return null;
  }
}