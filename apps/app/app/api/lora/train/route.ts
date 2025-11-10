// apps/app/app/api/lora/train/route.ts
/**
 * LoRA Training Orchestration API
 * ใช้ Northflank Jobs API แทน N8N
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;
const OLLAMA_PROJECT_ID = process.env.OLLAMA_PROJECT_ID!;
const OLLAMA_SERVICE_ID = process.env.OLLAMA_SERVICE_ID || 'ollama';

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
    const jobName = `train-${user.id.slice(0, 8)}-${adapterVersion}`;

    // 🚀 Create Northflank Job
    console.log(`🚀 Creating training job: ${jobName}`);
    
    const jobSpec = {
      name: jobName,
      type: 'job',
      description: `LoRA training for user ${user.id}`,
      
      // Run configuration
      runOn: {
        type: 'manual', // ไม่ใช่ scheduled
      },
      
      // Use same image as Ollama service
      job: {
        // ใช้ image ของ Ollama service ที่มี Python + training script
        dockerImage: {
          // Pull from existing service
          reference: `nf-image:${OLLAMA_SERVICE_ID}`,
        },
        
        // Run training script
        command: [
          '/bin/bash',
          '-c',
          `source /opt/venv/bin/activate && python3 /scripts/train_lora.py "${connectionString}" "${user.id}" "mistral" "${adapterVersion}"`,
        ],
        
        // Environment variables
        env: {
          POSTGRES_URI: connectionString,
          USER_ID: user.id,
          ADAPTER_VERSION: adapterVersion,
          OUTPUT_DIR: `/models/adapters/${user.id}/${adapterVersion}`,
        },
        
        // Resource limits
        resources: {
          limits: {
            memory: '8Gi',
            cpu: '4000m', // 4 cores
          },
          requests: {
            memory: '4Gi',
            cpu: '2000m',
          },
        },
        
        // Job settings
        backoffLimit: 0, // ไม่ retry ถ้า fail
        activeDeadlineSeconds: 3600, // 1 hour timeout
      },
    };

    const jobResponse = await fetch(
      `https://api.northflank.com/v1/projects/${OLLAMA_PROJECT_ID}/jobs`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobSpec),
      }
    );

    if (!jobResponse.ok) {
      const errorText = await jobResponse.text();
      console.error('❌ Job creation failed:', errorText);
      throw new Error(`Failed to create job: ${jobResponse.status}`);
    }

    const jobData = await jobResponse.json();
    const jobId = jobData.data?.id;

    console.log(`✅ Job created: ${jobId}`);

    // 💾 Update training status
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
      jobId,
      jobName,
      adapterVersion,
      datasetComposition: {
        good: user.goodChannelCount,
        bad: user.badChannelCount,
        mcl: user.mclChainCount,
      },
      totalSamples: totalData,
    });

    // 🔄 Start monitoring job status
    monitorJobStatus(user.id, jobId, adapterVersion, connectionString).catch(console.error);

    return NextResponse.json({
      success: true,
      status: 'training',
      jobId,
      adapterVersion,
      message: 'Training started. This will take 10-30 minutes.',
      estimatedTime: '10-30 minutes',
    });

  } catch (error) {
    console.error('❌ Training start error:', error);
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

    // Get latest job if training
    let latestJob = null;
    if (user.loraTrainingStatus === 'training') {
      // Poll job status from Northflank
      // (implementation below)
    }

    return NextResponse.json({
      status: user.loraTrainingStatus || 'idle',
      currentVersion: user.loraAdapterVersion,
      lastTrainedAt: user.loraLastTrainedAt,
      error: user.loraTrainingError,
      latestJob,
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

// ===== Helper: Auto-approve data =====
async function autoApproveData(connectionString: string, userId: string) {
  const { Client } = require('pg');
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    // Approve good channel (high quality)
    await client.query(`
      UPDATE user_data_schema.stm_good
      SET approved_for_consolidation = TRUE
      WHERE user_id = $1
        AND approved_for_consolidation = FALSE
        AND alignment_score >= 0.7
    `, [userId]);
    
    // Approve bad channel (with counterfactuals)
    await client.query(`
      UPDATE user_data_schema.stm_bad
      SET approved_for_shadow_learning = TRUE
      WHERE user_id = $1
        AND approved_for_shadow_learning = FALSE
        AND safe_counterfactual IS NOT NULL
    `, [userId]);
    
    // Approve MCL chains
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

// ===== Helper: Monitor job status =====
async function monitorJobStatus(userId: string, jobId: string, adapterVersion: string) {
  console.log(`🔍 Monitoring job ${jobId}...`);
  
  const maxAttempts = 60; // 30 minutes (30s interval)
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30s
    attempts++;
    
    try {
      // Get job status
      const jobResponse = await fetch(
        `https://api.northflank.com/v1/projects/${OLLAMA_PROJECT_ID}/jobs/${jobId}`,
        {
          headers: {
            Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          },
        }
      );
      
      if (!jobResponse.ok) {
        console.error('❌ Cannot get job status');
        continue;
      }
      
      const jobData = await jobResponse.json();
      const status = jobData.data?.status?.state;
      
      console.log(`📊 Job status: ${status} (attempt ${attempts}/${maxAttempts})`);
      
      if (status === 'SUCCEEDED') {
        console.log('✅ Training completed successfully!');
        
        await db.user.update({
          where: { id: userId },
          data: {
            loraTrainingStatus: 'completed',
            loraLastTrainedAt: new Date(),
            loraTrainingError: null,
            updatedAt: new Date(),
          },
        });
        
        break;
      } else if (status === 'FAILED' || status === 'ERROR') {
        console.error('❌ Training failed');
        
        await db.user.update({
          where: { id: userId },
          data: {
            loraTrainingStatus: 'failed',
            loraTrainingError: 'Training job failed. Please check logs.',
            updatedAt: new Date(),
          },
        });
        
        break;
      }
      
    } catch (error) {
      console.error('❌ Monitoring error:', error);
    }
  }
  
  if (attempts >= maxAttempts) {
    console.error('⏰ Training timeout');
    
    await db.user.update({
      where: { id: userId },
      data: {
        loraTrainingStatus: 'failed',
        loraTrainingError: 'Training timeout (exceeded 30 minutes)',
        updatedAt: new Date(),
      },
    });
  }
}

// ===== Helper: Get Postgres connection =====
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
    return credentials.data?.envs?.EXTERNAL_POSTGRES_URI || 
           credentials.data?.envs?.POSTGRES_URI || 
           null;
  } catch (error) {
    console.error('Error getting connection string:', error);
    return null;
  }
}