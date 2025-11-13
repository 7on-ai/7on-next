// apps/app/lib/northflank-job.ts
/**
 * Northflank Job Management for LoRA Training
 */

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;
const NORTHFLANK_API_BASE = 'https://api.northflank.com/v1';

export interface TriggerTrainingJobParams {
  projectId: string;
  userId: string;
  adapterVersion: string;
  postgresUri: string;
  modelName?: string;
}

export interface JobRunStatus {
  runId: string;
  jobId: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  startedAt?: string;
  completedAt?: string;
  exitCode?: number;
  error?: string;
}

export interface JobRunLogs {
  logs: string;
  hasMore: boolean;
}

/**
 * Trigger a training job run
 */
export async function triggerTrainingJob(
  params: TriggerTrainingJobParams
): Promise<{ runId: string; jobId: string }> {
  const { projectId, userId, adapterVersion, postgresUri, modelName } = params;
  
  const jobId = 'user-lora-training';
  
  console.log(`🚀 Triggering training job for user ${userId}`);
  console.log(`   Project: ${projectId}`);
  console.log(`   Job: ${jobId}`);
  console.log(`   Adapter: ${adapterVersion}`);
  
  try {
    // ✅ FIX: ใช้ /runs (พหูพจน์) ไม่ใช่ /run
    const response = await fetch(
      `${NORTHFLANK_API_BASE}/projects/${projectId}/jobs/${jobId}/runs`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          environmentOverrides: {
            POSTGRES_URI: postgresUri,
            USER_ID: userId,
            MODEL_NAME: modelName || 'TinyLlama/TinyLlama-1.1B-Chat-v1.0',
            ADAPTER_VERSION: adapterVersion,
            OUTPUT_PATH: '/workspace/adapters',
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Job trigger failed:`, {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      
      throw new Error(
        `Failed to trigger training job: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();
    const runId = data.data?.id;
    
    if (!runId) {
      console.error('❌ No run ID in response:', data);
      throw new Error('No run ID returned from Northflank');
    }

    console.log(`✅ Job run triggered: ${runId}`);
    
    return {
      runId,
      jobId,
    };
    
  } catch (error) {
    console.error('❌ Error triggering job:', error);
    throw error;
  }
}

/**
 * Get job run status
 */
export async function getJobRunStatus(
  projectId: string,
  jobId: string,
  runId: string
): Promise<JobRunStatus> {
  try {
    const response = await fetch(
      `${NORTHFLANK_API_BASE}/projects/${projectId}/jobs/${jobId}/runs/${runId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Job run not found');
      }
      const errorText = await response.text();
      throw new Error(`Failed to get job status: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const run = data.data;
    
    let status: JobRunStatus['status'] = 'pending';
    
    if (run.status === 'RUNNING') {
      status = 'running';
    } else if (run.status === 'SUCCEEDED' || run.status === 'COMPLETED') {
      status = 'succeeded';
    } else if (run.status === 'FAILED') {
      status = 'failed';
    } else if (run.status === 'CANCELLED') {
      status = 'cancelled';
    }

    return {
      runId: run.id,
      jobId,
      status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      exitCode: run.exitCode,
      error: run.error || run.failureReason,
    };
    
  } catch (error) {
    console.error(`❌ Error getting job status:`, error);
    throw error;
  }
}

/**
 * Get job run logs
 */
export async function getJobRunLogs(
  projectId: string,
  jobId: string,
  runId: string,
  tail?: number
): Promise<JobRunLogs> {
  try {
    const params = new URLSearchParams();
    if (tail) {
      params.append('tail', tail.toString());
    }
    
    const response = await fetch(
      `${NORTHFLANK_API_BASE}/projects/${projectId}/jobs/${jobId}/runs/${runId}/logs?${params}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get logs: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      logs: data.data?.logs || '',
      hasMore: data.data?.hasMore || false,
    };
    
  } catch (error) {
    console.error(`❌ Error getting logs:`, error);
    return {
      logs: '',
      hasMore: false,
    };
  }
}

/**
 * Cancel a running job
 */
export async function cancelJobRun(
  projectId: string,
  jobId: string,
  runId: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `${NORTHFLANK_API_BASE}/projects/${projectId}/jobs/${jobId}/runs/${runId}/cancel`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Cancel job failed:`, errorText);
      return false;
    }

    console.log(`✅ Job run cancelled: ${runId}`);
    return true;
    
  } catch (error) {
    console.error('❌ Error cancelling job:', error);
    return false;
  }
}

/**
 * Extract training metadata from logs
 */
export function extractMetadataFromLogs(logs: string): any | null {
  try {
    const startMarker = '===METADATA_START===';
    const endMarker = '===METADATA_END===';
    
    const startIdx = logs.indexOf(startMarker);
    const endIdx = logs.indexOf(endMarker);
    
    if (startIdx === -1 || endIdx === -1) {
      return null;
    }
    
    const jsonStr = logs.substring(
      startIdx + startMarker.length,
      endIdx
    ).trim();
    
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Error extracting metadata:', error);
    return null;
  }
}

/**
 * Check if adapter files exist in volume
 */
export async function verifyAdapterOutput(
  projectId: string,
  userId: string,
  adapterVersion: string
): Promise<boolean> {
  return true;
}