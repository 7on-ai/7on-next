// app/api/provision-northflank/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { database as db } from '@repo/database';
import { auth } from '@clerk/nextjs/server';

const NORTHFLANK_API_TOKEN = process.env.NORTHFLANK_API_TOKEN!;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://your-app.vercel.app/api/setup-webhook';
const WEBHOOK_AUTH_TOKEN = process.env.WEBHOOK_AUTH_TOKEN || 'webhook-secret-token-7on';

// In-memory set to prevent duplicate runs
const runningMonitors = new Set<string>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, userName, userEmail } = body;

    console.log('🚀 Provision Northflank called for user:', userId);

    if (!userId || !userEmail) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing userId or userEmail',
          details: {
            userId: userId ? 'provided' : 'missing',
            userEmail: userEmail ? 'provided' : 'missing',
          }
        },
        { status: 400 }
      );
    }

    // Get Clerk User ID
    let clerkUserId: string | null | undefined = null;
    
    const dbUser = await db.user.findUnique({
      where: { id: userId },
      select: { clerkId: true },
    });

    if (dbUser?.clerkId) {
      clerkUserId = dbUser.clerkId;
      console.log('✅ Clerk User ID from database:', clerkUserId);
    } else {
      const authResult = await auth();
      if (authResult?.userId) {
        clerkUserId = authResult.userId;
        console.log('✅ Clerk User ID from auth context:', clerkUserId);
      } else {
        console.error('❌ Could not retrieve Clerk User ID');
        return NextResponse.json(
          { success: false, error: 'Could not retrieve Clerk User ID' },
          { status: 400 }
        );
      }
    }

    // Prevent duplicate runs
    if (runningMonitors.has(userId)) {
      console.log('⚠️ Monitoring already running for user:', userId);
      return NextResponse.json({
        success: true,
        message: 'Monitoring already in progress for this user',
        status: 'monitoring_active',
      });
    }

    // Check existing project
    const existingUser = await db.user.findUnique({
      where: { id: userId },
      select: {
        northflankProjectId: true,
        n8nUrl: true,
        n8nApiKey: true,
        n8nEncryptionKey: true,
        northflankProjectStatus: true,
      },
    });

    if (existingUser?.northflankProjectId) {
      console.log('User already has a project:', existingUser.northflankProjectId);

      const projectResponse = await fetch(
        `https://api.northflank.com/v1/projects/${existingUser.northflankProjectId}`,
        {
          headers: {
            Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (projectResponse.ok) {
        const project = await projectResponse.json();

        let n8nUrl = existingUser.n8nUrl;
        if (!n8nUrl) {
          const n8nData = await getN8nHostFromProject(existingUser.northflankProjectId);
          if (n8nData?.n8nUrl) {
            n8nUrl = n8nData.n8nUrl;

            await db.user.update({
              where: { id: userId },
              data: {
                n8nUrl: n8nUrl,
                northflankSecretData: n8nData.allSecrets,
                updatedAt: new Date(),
              },
            });

            if (!existingUser.n8nApiKey && existingUser.n8nEncryptionKey) {
              console.log('Existing project: Attempting to create missing n8n API Key...');
              const fallbackKey = generateApiKey();
              const apiKey = await createN8nApiKey(
                n8nUrl,
                existingUser.n8nEncryptionKey,
                userEmail,
                fallbackKey
              );
              
              if (apiKey) {
                await db.user.update({
                  where: { id: userId },
                  data: { n8nApiKey: apiKey },
                });
                console.log('Existing project: n8n API Key created successfully');
              }
            }
          }
        }

        return NextResponse.json({
          success: true,
          project: {
            id: project.data.id,
            name: project.data.name,
            status: 'existing',
          },
          n8nUrl,
          apiKey: existingUser.n8nApiKey ? '[STORED]' : '[NOT SET]',
          message: 'User already has an existing Northflank project',
        });
      }
    }

    console.log('Creating new project for user...');

    runningMonitors.add(userId);

    try {
      const templateRun = await startSundayTemplate(
        userId, 
        clerkUserId!, 
        userName, 
        userEmail
      );
      
      console.log('Template run initiated - starting monitoring');

      await db.user.update({
        where: { id: userId },
        data: {
          northflankWorkflowId: templateRun.data.id,
          n8nUserEmail: userEmail,
          n8nEncryptionKey: templateRun.encryptionKey,
          northflankProjectStatus: 'initiated',
          northflankCreatedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      monitorN8nDeployment(
        templateRun.data.id,
        userId,
        templateRun.encryptionKey,
        userEmail,
        templateRun.apiKey
      ).finally(() => {
        runningMonitors.delete(userId);
      });

      return NextResponse.json({
        success: true,
        method: 'template-ultra-fast-hybrid',
        templateRun: {
          id: templateRun.data.id,
          status: 'initiated',
        },
        message: 'Template deployment initiated with Neon database integration!',
        estimatedTime: '5-10 minutes',
        monitoring: 'Ultra-fast N8N_HOST monitoring active',
        userCredentials: {
          email: userEmail,
          encryptionKey: templateRun.encryptionKey,
        },
        apiKeyMethod: 'Hybrid: REST API preferred, fallback to generated key',
      });
    } catch (templateError) {
      runningMonitors.delete(userId);
      console.error('Template initiation failed:', templateError);

      const manualResult = await createCompleteProject(userId, userName, userEmail);

      await db.user.update({
        where: { id: userId },
        data: {
          northflankProjectId: manualResult.project.id,
          northflankProjectName: manualResult.project.name,
          northflankProjectStatus: 'manual',
          n8nUserEmail: userEmail,
          n8nEncryptionKey: manualResult.encryptionKey,
          northflankCreatedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        method: 'manual',
        project: manualResult.project,
        message: 'Basic project created successfully. N8N deployment needs to be done manually.',
        userCredentials: {
          email: userEmail,
          encryptionKey: manualResult.encryptionKey,
        },
      });
    }
  } catch (error) {
    const err = error as Error;
    console.error('💥 Error in provision-northflank:', err);
    console.error('Stack trace:', err.stack);

    const body = await request.json().catch(() => ({}));
    if (body.userId) {
      runningMonitors.delete(body.userId);

      try {
        await db.user.update({
          where: { id: body.userId },
          data: {
            northflankProjectStatus: 'failed',
            n8nSetupError: err.message,
            updatedAt: new Date(),
          },
        });
      } catch (dbError) {
        console.error('Failed to update database with error status:', dbError);
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Unknown error occurred',
        errorType: err.name,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// ===== HELPER FUNCTIONS =====

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'n8n_';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function startSundayTemplate(
  userId: string,
  clerkUserId: string,
  userName: string,
  userEmail: string
) {
  const nameParts = (userName || '').trim().split(/\s+/);
  const firstName = nameParts[0] || userName || userEmail.split('@')[0];
  const encryptionKey = Math.random().toString(36).substring(2, 34);
  const n8nApiKey = generateApiKey();

  console.log('Generated N8N API Key for fallback:', n8nApiKey.substring(0, 10) + '...[REDACTED]');

  // ✅ ENHANCED: Validate ALL required environment variables
  const requiredEnvVars = {
    DATABASE_URL: process.env.DATABASE_URL,
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    NORTHFLANK_API_TOKEN: NORTHFLANK_API_TOKEN,
    WEBHOOK_URL: WEBHOOK_URL,
    WEBHOOK_AUTH_TOKEN: WEBHOOK_AUTH_TOKEN,
  };

  const missingVars = Object.entries(requiredEnvVars)
    .filter(([_, value]) => !value || value === 'undefined')
    .map(([key]) => key);

  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars);
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  // ✅ Validate DATABASE_URL format
  if (!requiredEnvVars.DATABASE_URL?.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection string starting with postgresql://');
  }

  // ✅ Validate encryption key length
  if (encryptionKey.length < 32) {
    console.error('❌ Generated encryption key too short:', encryptionKey.length);
    throw new Error('Encryption key generation failed - insufficient length');
  }

  console.log('✅ All environment variables validated successfully');
  console.log('Environment check:', {
    DATABASE_URL: requiredEnvVars.DATABASE_URL ? '✓ Set (Neon)' : '✗ Missing',
    GOOGLE_OAUTH_CLIENT_ID: requiredEnvVars.GOOGLE_OAUTH_CLIENT_ID ? '✓ Set' : '✗ Missing',
    GOOGLE_OAUTH_CLIENT_SECRET: requiredEnvVars.GOOGLE_OAUTH_CLIENT_SECRET ? '✓ Set' : '✗ Missing',
    WEBHOOK_URL: requiredEnvVars.WEBHOOK_URL ? '✓ Set' : '✗ Missing',
    WEBHOOK_AUTH_TOKEN: requiredEnvVars.WEBHOOK_AUTH_TOKEN ? '✓ Set' : '✗ Missing',
  });

  const templateRunPayload = {
    arguments: {
      id: userId.substring(0, 8),
      clerk_user_id: clerkUserId,
      user_id: userId,
      user_email: userEmail,
      user_name: firstName,
      webhook_url: requiredEnvVars.WEBHOOK_URL!,
      webhook_token: requiredEnvVars.WEBHOOK_AUTH_TOKEN!,
      N8N_ENCRYPTION_KEY: encryptionKey,
      neon_database_url: requiredEnvVars.DATABASE_URL!,
      google_oauth_client_id: requiredEnvVars.GOOGLE_OAUTH_CLIENT_ID!,
      google_oauth_client_secret: requiredEnvVars.GOOGLE_OAUTH_CLIENT_SECRET!,
    },
  };

  console.log('Starting Sunday template with validated configuration...');
  console.log('Arguments:', {
    ...templateRunPayload.arguments,
    N8N_ENCRYPTION_KEY: '[REDACTED]',
    neon_database_url: '[REDACTED - Neon DB]',
    google_oauth_client_secret: '[REDACTED]',
    webhook_token: '[REDACTED]',
  });

  const response = await fetch('https://api.northflank.com/v1/templates/sunday/runs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(templateRunPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Template run failed:', errorText);
    throw new Error(`Template run failed: ${errorText}`);
  }

  const result = await response.json();
  console.log('✅ Template run started with ID:', result.data.id);

  return {
    ...result,
    encryptionKey,
    apiKey: n8nApiKey,
    status: 'initiated',
  };
}

async function createCompleteProject(userId: string, userName: string, userEmail: string) {
  const projectName = `sunday-${userId.substring(0, 8)}-${Date.now().toString().slice(-6)}`.toLowerCase();
  const encryptionKey = Math.random().toString(36).substring(2, 34);

  const projectResponse = await fetch('https://api.northflank.com/v1/projects', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectName,
      description: `N8N Workflow Project for user ${userName}`,
      region: 'asia-southeast',
    }),
  });

  if (!projectResponse.ok) {
    const error = await projectResponse.text();
    throw new Error(`Project creation failed: ${error}`);
  }

  const project = await projectResponse.json();
  const projectId = project.data.id;

  console.log('Manual project created:', projectId);

  return {
    success: true,
    project: {
      id: projectId,
      name: project.data.name,
      status: 'created',
    },
    encryptionKey,
    method: 'manual',
  };
}

async function getProjectIdFromTemplate(templateRunId: string): Promise<string | null> {
  try {
    const runResponse = await fetch(
      `https://api.northflank.com/v1/templates/sunday/runs/${templateRunId}`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!runResponse.ok) {
      console.log('Template run not found yet');
      return null;
    }

    const runDetails = await runResponse.json();
    console.log('Template run status:', runDetails.data?.status);

    if (runDetails.data?.spec?.steps) {
      const projectStep = runDetails.data.spec.steps.find((step: any) => step.kind === 'Project');
      if (projectStep?.response?.data?.id) {
        console.log('✅ Project ID found in workflow steps:', projectStep.response.data.id);
        return projectStep.response.data.id;
      }
    }

    if (runDetails.data?.output?.project_id) {
      console.log('✅ Project ID found in output:', runDetails.data.output.project_id);
      return runDetails.data.output.project_id;
    }

    if (runDetails.data?.results && Array.isArray(runDetails.data.results)) {
      for (const result of runDetails.data.results) {
        if (result.kind === 'Project' && result.data?.id) {
          console.log('✅ Project ID found in results:', result.data.id);
          return result.data.id;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting project ID:', error);
    return null;
  }
}

async function getN8nHostFromProject(projectId: string) {
  try {
    console.log('FAST CHECK: Looking for N8N_HOST in project:', projectId);

    const secretGroupsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/secret-groups`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!secretGroupsResponse.ok) {
      return null;
    }

    const secretGroups = await secretGroupsResponse.json();
    const n8nSecretsGroup = secretGroups.data?.find((sg: any) => sg.name === 'n8n-secrets');

    if (!n8nSecretsGroup) {
      console.log('FAST CHECK: n8n-secrets group not found yet');
      return null;
    }

    const secretDetailsResponse = await fetch(
      `https://api.northflank.com/v1/projects/${projectId}/secret-groups/${n8nSecretsGroup.id}`,
      {
        headers: {
          Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!secretDetailsResponse.ok) {
      return null;
    }

    const secretDetails = await secretDetailsResponse.json();

    if (secretDetails.data?.data?.N8N_HOST && !secretDetails.data.data.N8N_HOST.includes('${refs.')) {
      const n8nUrl = `https://${secretDetails.data.data.N8N_HOST}`;
      console.log('FAST CHECK: N8N_HOST found!', n8nUrl);
      return {
        n8nUrl,
        allSecrets: secretDetails.data.data,
      };
    }

    console.log('FAST CHECK: N8N_HOST not ready (still template variable)');
    return null;
  } catch (error) {
    console.error('FAST CHECK: Error getting N8N_HOST:', error);
    return null;
  }
}

async function createN8nApiKey(
  n8nUrl: string,
  encryptionKey: string,
  userEmail: string,
  preGeneratedKey: string
): Promise<string> {
  try {
    console.log('Creating n8n API Key for URL:', n8nUrl);
    
    console.log('Waiting for N8N to be ready...');
    await new Promise((resolve) => setTimeout(resolve, 30000));

    const password = `7On${encryptionKey}`;
    const credentials = btoa(`${userEmail}:${password}`);

    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`API Key creation attempt ${attempt}/${maxRetries}`);

        const healthCheck = await fetch(`${n8nUrl}/healthz`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!healthCheck.ok) {
          console.log(`Health check failed on attempt ${attempt}, waiting...`);
          await new Promise((resolve) => setTimeout(resolve, 15000 * attempt));
          continue;
        }

        console.log('N8N health check passed, attempting API key creation...');

        const response = await fetch(`${n8nUrl}/rest/api-key`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${credentials}`,
          },
          body: JSON.stringify({
            name: `auto-generated-${Date.now()}`,
            expiresAt: null,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          const apiKey = result?.data?.apiKey || result?.data?.key || result?.apiKey;
          
          if (apiKey) {
            console.log('✅ N8N API Key created successfully via REST API');
            return apiKey;
          }
        } else {
          const errorText = await response.text();
          console.error(`API Key creation failed (attempt ${attempt}):`, response.status, errorText);
        }
      } catch (err) {
        console.error(`API Key creation error (attempt ${attempt}):`, (err as Error).message);
      }

      if (attempt < maxRetries) {
        const waitTime = 15000 * attempt;
        console.log(`Waiting ${waitTime / 1000}s before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    console.log('⚠️ REST API method failed, using pre-generated key as fallback');
    return preGeneratedKey;
  } catch (err) {
    console.error('Critical error creating n8n API Key:', (err as Error).message);
    console.log('🔄 Using pre-generated key as fallback');
    return preGeneratedKey;
  }
}

async function monitorN8nDeployment(
  templateRunId: string,
  userId: string,
  encryptionKey: string,
  userEmail: string,
  preGeneratedApiKey: string
) {
  console.log('ULTRA FAST MONITORING: Started for template', templateRunId, 'user', userId);

  const maxWaitTime = 900000; // 15 minutes max
  const fastPollInterval = 30000; // Check every 30 seconds
  const startTime = Date.now();
  let projectId: string | null = null;
  let n8nFound = false;

  while (Date.now() - startTime < maxWaitTime && !n8nFound) {
    try {
      if (!projectId) {
        console.log('ULTRA FAST: Getting project ID...');
        projectId = await getProjectIdFromTemplate(templateRunId);
        
        if (projectId) {
          console.log('ULTRA FAST: Project ID found!', projectId);
          
          await db.user.update({
            where: { id: userId },
            data: {
              northflankProjectId: projectId,
              northflankProjectStatus: 'deploying',
              updatedAt: new Date(),
            },
          });
        }
      }

      if (projectId) {
        console.log('ULTRA FAST: Checking N8N_HOST availability...');
        const n8nData = await getN8nHostFromProject(projectId);
        
        if (n8nData?.n8nUrl) {
          console.log('ULTRA FAST: N8N_HOST FOUND!', n8nData.n8nUrl);
          n8nFound = true;

          let projectName = 'Unknown';
          try {
            const projectResponse = await fetch(
              `https://api.northflank.com/v1/projects/${projectId}`,
              {
                headers: {
                  Authorization: `Bearer ${NORTHFLANK_API_TOKEN}`,
                  'Content-Type': 'application/json',
                },
              }
            );
            
            if (projectResponse.ok) {
              const project = await projectResponse.json();
              projectName = project.data.name;
            }
          } catch (e) {
            console.log('Could not get project name:', e);
          }

          console.log('ULTRA FAST: Attempting to create n8n API Key via REST API...');
          const finalApiKey = await createN8nApiKey(
            n8nData.n8nUrl,
            encryptionKey,
            userEmail,
            preGeneratedApiKey
          );

          console.log('ULTRA FAST: Updating database with final results...');
          await db.user.update({
            where: { id: userId },
            data: {
              n8nUrl: n8nData.n8nUrl,
              n8nUserEmail: userEmail,
              n8nEncryptionKey: encryptionKey,
              n8nApiKey: finalApiKey,
              northflankProjectId: projectId,
              northflankProjectName: projectName,
              northflankProjectStatus: 'ready',
              northflankSecretData: n8nData.allSecrets,
              templateCompletedAt: new Date(),
              updatedAt: new Date(),
            },
          });

          console.log('ULTRA FAST: SUCCESS! N8N setup completed with Neon database');
          return;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, fastPollInterval));
    } catch (error) {
      console.error('ULTRA FAST: Monitoring error:', error);
      await new Promise((resolve) => setTimeout(resolve, fastPollInterval));
    }
  }

  console.log('ULTRA FAST: Timeout reached without finding N8N_HOST');
  await db.user.update({
    where: { id: userId },
    data: {
      northflankProjectStatus: 'timeout',
      n8nSetupError: 'N8N_HOST not available within time limit',
      updatedAt: new Date(),
    },
  });
}