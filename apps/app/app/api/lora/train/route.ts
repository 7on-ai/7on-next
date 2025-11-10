// apps/app/app/api/lora/train/route.ts
// ✅ FIXED: Added cancel functionality and improved monitoring
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { database as db } from '@repo/database';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;
const OLLAMA_PROJECT_ID = process.env.OLLAMA_PROJECT_ID!;
const OLLAMA_SERVICE_ID = process.env.OLLAMA_SERVICE_ID || 'ollama';

// ✅ Internal service URL (from Northflank)
const OLLAMA_INTERNAL_URL = 'http://train--ollama--fppvxj4w99rz.code.run';
const OLLAMA_TRAINING_ENDPOINT = `${OLLAMA_INTERNAL_URL}/api/train`;

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

    console.log(`🚀 Starting training via Ollama service: ${trainingId}`);

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
      const trainingResponse = await fetch(OLLAMA_TRAINING_ENDPOINT, {
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
          dataset_composition: {
            good_channel: user.goodChannelCount,
            bad_channel: user.badChannelCount,
            mcl_chains: user.mclChainCount,
          },
          hyperparameters: {
            learning_rate: 2e-4,
            batch_size: 4,
            num_epochs: 3,
            lora_rank: 8,
            lora_alpha: 16,
          },
        }),
      });

      if (!trainingResponse.ok) {
        const errorText = await trainingResponse.text();
        console.error('❌ Ollama training request failed:', errorText);
        throw new Error(`Training request failed: ${trainingResponse.status}`);
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
        message: 'Training started on Ollama service. This will take 10-30 minutes.',
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

    // ตรวจสอบว่ากำลัง training อยู่หรือไม่
    if (user.loraTrainingStatus !== 'training') {
      return NextResponse.json({ 
        error: 'No training in progress',
        status: user.loraTrainingStatus 
      }, { status: 400 });
    }

    console.log(`🛑 Cancelling training for user ${user.id}`);

    // อัปเดตสถานะเป็น cancelled
    await db.user.update({
      where: { id: user.id },
      data: {
        loraTrainingStatus: 'cancelled',
        loraTrainingError: 'Training cancelled by user',
        updatedAt: new Date(),
      },
    });

    // อัปเดต training job ในฐานข้อมูล
    const connectionString = await getPostgresConnectionString(user.northflankProjectId!);
    if (connectionString) {
      const { Client } = require('pg');
      const client = new Client({ connectionString });
      
      try {
        await client.connect();
        
        // ✅ แก้ไข SQL query - ใช้ subquery แทน ORDER BY ใน UPDATE
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
        
        console.log('✅ Training job status updated to cancelled');
        
      } catch (dbError) {
        console.error('⚠️ Database update error:', dbError);
        // ไม่ throw error เพราะเราอัปเดต Prisma สำเร็จแล้ว
      } finally {
        await client.end();
      }
    }

    // พยายามหยุด training บน Ollama service (optional)
    try {
      const trainingId = `train-${user.id.slice(0, 8)}`;
      
      await fetch(`${OLLAMA_INTERNAL_URL}/api/train/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          training_id: trainingId,
          user_id: user.id,
        }),
        signal: AbortSignal.timeout(5000),
      }).catch(err => {
        console.warn('⚠️ Could not notify Ollama service:', err.message);
      });
    } catch (ollamaError) {
      console.warn('⚠️ Ollama cancel notification failed:', ollamaError);
      // ไม่ throw error เพราะเราได้อัปเดตสถานะใน DB แล้ว
    }

    console.log('✅ Training cancelled successfully');

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

async function autoApproveData(connectionString: string, userId: string) {
  const { Client } = require('pg');
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    // Approve good channel data
    await client.query(`
      UPDATE user_data_schema.stm_good 
      SET approved_for_consolidation = TRUE 
      WHERE user_id = $1 
        AND approved_for_consolidation = FALSE 
        AND alignment_score >= 0.7
    `, [userId]);
    
    // Approve bad channel data with counterfactuals
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

async function monitorTrainingStatus(
  userId: string,
  trainingId: string,
  adapterVersion: string,
  connectionString: string
) {
  console.log(`🔍 Monitoring training ${trainingId}...`);
  
  const maxAttempts = 60; // 30 minutes (30s interval)
  let attempts = 0;
  let consecutiveErrors = 0;
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30s
    attempts++;
    
    try {
      // ✅ ตรวจสอบสถานะจาก Prisma DB ก่อน (สำหรับ cancel detection)
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { loraTrainingStatus: true },
      });

      // ถ้าถูกยกเลิกหรือเปลี่ยนสถานะจาก UI หยุด monitoring
      if (!user || user.loraTrainingStatus === 'cancelled') {
        console.log('🛑 Training cancelled via database');
        break;
      }

      if (user.loraTrainingStatus === 'completed' || user.loraTrainingStatus === 'failed') {
        console.log(`ℹ️ Training already ${user.loraTrainingStatus}`);
        break;
      }

      // ✅ ตรวจสอบสถานะจาก Ollama service
      const statusResponse = await fetch(
        `${OLLAMA_INTERNAL_URL}/api/train/status/${trainingId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!statusResponse.ok) {
        consecutiveErrors++;
        console.warn(`⚠️ Cannot get training status (attempt ${attempts}/${maxAttempts}, errors: ${consecutiveErrors})`);
        
        // ถ้าไม่ได้รับ response 10 ครั้งติดต่อกัน ให้ถือว่าล้มเหลว
        if (consecutiveErrors >= 10) {
          console.error('❌ Training service not responding (10 consecutive errors)');
          
          await db.user.update({
            where: { id: userId },
            data: {
              loraTrainingStatus: 'failed',
              loraTrainingError: 'Training service not responding',
              updatedAt: new Date(),
            },
          });

          await updateTrainingJobStatus(connectionString, trainingId, {
            status: 'failed',
            errorMessage: 'Training service not responding',
            completedAt: new Date(),
          });
          
          break;
        }
        
        continue;
      }

      // Reset error counter on success
      consecutiveErrors = 0;

      const statusData = await statusResponse.json();
      const status = statusData.status;
      
      console.log(`📊 Training status: ${status} (attempt ${attempts}/${maxAttempts})`);

      if (status === 'completed' || status === 'success') {
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

        await updateTrainingJobStatus(connectionString, trainingId, {
          status: 'completed',
          completedAt: new Date(),
          trainingLoss: statusData.final_loss,
          finalMetrics: statusData.metrics,
        });
        
        break;
      } 
      else if (status === 'failed' || status === 'error') {
        console.error('❌ Training failed');
        
        const errorMessage = statusData.error || 'Training failed on Ollama service';
        
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
          errorMessage,
          completedAt: new Date(),
        });
        
        break;
      }
      else if (status === 'cancelled') {
        console.log('🛑 Training was cancelled');
        break;
      }
      else if (status === 'training' || status === 'running') {
        // Still training, continue monitoring
        console.log(`⏳ Training in progress... (${statusData.progress || 'N/A'})`);
      }
      
    } catch (error) {
      consecutiveErrors++;
      console.error(`❌ Monitoring error (attempt ${attempts}, errors: ${consecutiveErrors}):`, error);
      
      // ถ้า error มากเกินไป ให้หยุด
      if (consecutiveErrors >= 10) {
        console.error('❌ Too many consecutive errors, stopping monitoring');
        
        await db.user.update({
          where: { id: userId },
          data: {
            loraTrainingStatus: 'failed',
            loraTrainingError: 'Monitoring failed: ' + (error as Error).message,
            updatedAt: new Date(),
          },
        });

        await updateTrainingJobStatus(connectionString, trainingId, {
          status: 'failed',
          errorMessage: 'Monitoring failed: ' + (error as Error).message,
          completedAt: new Date(),
        });
        
        break;
      }
    }
  }
  
  // Timeout handling
  if (attempts >= maxAttempts) {
    console.error('⏰ Training timeout (30 minutes exceeded)');
    
    await db.user.update({
      where: { id: userId },
      data: {
        loraTrainingStatus: 'failed',
        loraTrainingError: 'Training timeout (exceeded 30 minutes)',
        updatedAt: new Date(),
      },
    });

    await updateTrainingJobStatus(connectionString, trainingId, {
      status: 'failed',
      errorMessage: 'Training timeout',
      completedAt: new Date(),
    });
  }
  
  console.log(`✅ Monitoring completed for ${trainingId}`);
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
    finalMetrics?: any;
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
    
    if (update.finalMetrics) {
      setClauses.push(`final_metrics = $${paramIndex++}`);
      values.push(JSON.stringify(update.finalMetrics));
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
    
    console.log('✅ Training job status updated');
    
  } finally {
    await client.end();
  }
}

async function getPostgresConnectionString(projectId: string): Promise<string | null> {
  try {
    // Get addons list
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

    // Get credentials
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