// apps/app/app/api/lora/train/route.ts
// ✅ UPDATED: ใช้ Northflank Job แทน Ollama Service

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';
import {
  triggerTrainingJob,
  getJobRunStatus,
  getJobRunLogs,
  cancelJobRun,
  extractMetadataFromLogs,
} from '@/lib/northflank-job';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;

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

    // Check if already training
    if (user.loraTrainingStatus === 'training') {
      return NextResponse.json({
        error: 'Training already in progress',
        status: 'training',
      }, { status: 409 });
    }

    // Validate minimum data
    const totalData = user.goodChannelCount + user.badChannelCount + user.mclChainCount;
    
    if (totalData < 10) {
      return NextResponse.json({
        error: 'Not enough training data (need at least 10 samples)',
        current: totalData,
      }, { status: 400 });
    }

    if (user.goodChannelCount < 5) {
      return NextResponse.json({
        error: 'Not enough good channel data (need at least 5 samples for quality training)',
        current: user.goodChannelCount,
      }, { status: 400 });
    }

    // Get Postgres connection
    console.log('📝 Getting Postgres connection...');
    const connectionString = await getPostgresConnectionString(user.northflankProjectId);
    
    if (!connectionString) {
      throw new Error('Cannot get database connection');
    }

    // Auto-approve data
    console.log('📝 Auto-approving data...');
    await autoApproveData(connectionString, user.id);

    // Generate version
    const adapterVersion = `v${Date.now()}`;
    const trainingId = `train-${user.id.slice(0, 8)}-${adapterVersion}`;

    console.log(`🚀 Starting training: ${trainingId}`);

    // Update status to training
    await db.user.update({
      where: { id: user.id },
      data: {
        loraTrainingStatus: 'training',
        loraAdapterVersion: adapterVersion,
        loraTrainingError: null,
        updatedAt: new Date(),
      },
    });

    // Log to database
    await logTrainingJob(connectionString, {
      userId: user.id,
      jobId: trainingId,
      jobName: 'user-lora-training',
      adapterVersion,
      datasetComposition: {
        good: user.goodChannelCount,
        bad: user.badChannelCount,
        mcl: user.mclChainCount,
      },
      totalSamples: totalData,
    });

    // ✅ Trigger Northflank Job
    console.log('🚀 Triggering Northflank job...');
    
    let jobRun;
    try {
      jobRun = await triggerTrainingJob({
        projectId: user.northflankProjectId,
        userId: user.id,
        adapterVersion,
        postgresUri: connectionString,
        modelName: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0',
      });

      console.log('✅ Job triggered:', jobRun);

    } catch (triggerError) {
      console.error('❌ Job trigger failed:', triggerError);
      
      await db.user.update({
        where: { id: user.id },
        data: {
          loraTrainingStatus: 'failed',
          loraTrainingError: `Failed to start training: ${(triggerError as Error).message}`,
          updatedAt: new Date(),
        },
      });

      await updateTrainingJobStatus(connectionString, trainingId, {
        status: 'failed',
        errorMessage: (triggerError as Error).message,
        completedAt: new Date(),
      });

      throw triggerError;
    }

    // Start background monitoring
    startBackgroundMonitoring(
      user.id,
      trainingId,
      adapterVersion,
      connectionString,
      user.northflankProjectId,
      jobRun.runId
    );

    return NextResponse.json({
      success: true,
      status: 'training',
      trainingId,
      adapterVersion,
      runId: jobRun.runId,
      message: 'Training started successfully',
      estimatedTime: '10-30 minutes',
      stats: {
        good: user.goodChannelCount,
        bad: user.badChannelCount,
        mcl: user.mclChainCount,
        total: totalData,
      },
    });

  } catch (error) {
    console.error('❌ Training API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ===== Background Monitoring =====
function startBackgroundMonitoring(
  userId: string,
  trainingId: string,
  adapterVersion: string,
  connectionString: string,
  projectId: string,
  runId: string
) {
  console.log(`🔍 Starting background monitoring for run: ${runId}`);
  
  (async () => {
    const maxAttempts = 60; // 30 minutes (30s interval)
    let attempts = 0;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;
    const jobId = 'user-lora-training';
    
    while (attempts < maxAttempts) {
      try {
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30s
        attempts++;
        
        console.log(`🔍 [${runId}] Check ${attempts}/${maxAttempts}`);
        
        // Get job run status
        const status = await getJobRunStatus(projectId, jobId, runId);
        
        consecutiveErrors = 0; // Reset on success
        
        console.log(`📊 [${runId}] Status: ${status.status}`);
        
        if (status.status === 'succeeded') {
          console.log(`✅ [${runId}] Training completed!`);
          
          // Get logs to extract metadata
          const logs = await getJobRunLogs(projectId, jobId, runId, 5000);
          const metadata = extractMetadataFromLogs(logs.logs);
          
          if (metadata) {
            console.log('📊 Training metadata:', metadata);
          }
          
          // Update database
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
            metadata: metadata || {},
          });
          
          break;
        }
        
        if (status.status === 'failed') {
          console.error(`❌ [${runId}] Training failed`);
          
          // Get logs for error details
          const logs = await getJobRunLogs(projectId, jobId, runId, 1000);
          const errorMessage = status.error || 'Training failed - check logs';
          
          await db.user.update({
            where: { id: userId },
            data: {
              loraTrainingStatus: 'failed',
              loraTrainingError: errorMessage,
              updatedAt: new Date(),
            },
          });
          
          await updateTrainingJobStatus(connectionString, trainingId, {
            status: 'failed',
            errorMessage: errorMessage,
            completedAt: new Date(),
          });
          
          break;
        }
        
        if (status.status === 'cancelled') {
          console.log(`⚠️ [${runId}] Training cancelled`);
          
          await db.user.update({
            where: { id: userId },
            data: {
              loraTrainingStatus: 'cancelled',
              loraTrainingError: 'Cancelled by user',
              updatedAt: new Date(),
            },
          });
          
          await updateTrainingJobStatus(connectionString, trainingId, {
            status: 'cancelled',
            completedAt: new Date(),
          });
          
          break;
        }
        
      } catch (error) {
        consecutiveErrors++;
        console.error(`❌ [${runId}] Monitoring error (${consecutiveErrors}/${maxConsecutiveErrors}):`, error);
        
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.error(`❌ [${runId}] Too many errors, giving up`);
          
          await db.user.update({
            where: { id: userId },
            data: {
              loraTrainingStatus: 'failed',
              loraTrainingError: 'Monitoring failed: ' + (error as Error).message,
              updatedAt: new Date(),
            },
          });
          
          break;
        }
      }
    }
    
    if (attempts >= maxAttempts) {
      console.warn(`⏰ [${runId}] Monitoring timeout`);
      
      await db.user.update({
        where: { id: userId },
        data: {
          loraTrainingStatus: 'failed',
          loraTrainingError: 'Training timeout - may still be running',
          updatedAt: new Date(),
        },
      });
    }
    
    console.log(`🏁 [${runId}] Monitoring ended`);
  })().catch(err => {
    console.error(`💥 [${runId}] Background monitoring crashed:`, err);
  });
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

    if (!user.northflankProjectId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 400 });
    }

    // Note: To actually cancel, we need to track runId
    // For now, just update status
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
    if (update.metadata) {
      setClauses.push(`metadata = $${i++}`);
      values.push(JSON.stringify(update.metadata));
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