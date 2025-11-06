import { NextRequest, NextResponse } from 'next/server';
import { database as db } from '@repo/database';
import {
  exchangeCodeForOpenRouterKey,
  createOpenRouterCredentialInN8n,
} from '@/lib/openrouter-oauth';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log('🚀 OpenRouter callback started');
    
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    
    // Handle errors
    if (error) {
      console.error('❌ OpenRouter OAuth error:', error);
      return redirectWithError(`openrouter_error: ${error}`);
    }
    
    if (!code || !state) {
      console.error('❌ Missing parameters');
      return redirectWithError('missing_parameters');
    }
    
    // Decode state
    let stateData: { user_id: string; code_verifier: string; timestamp: number };
    try {
      stateData = JSON.parse(atob(state));
      
      // Check expiration (15 minutes)
      if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
        throw new Error('State expired');
      }
    } catch (err) {
      console.error('❌ Invalid or expired state:', err);
      return redirectWithError('invalid_state');
    }
    
    // Exchange code for OpenRouter API key
    console.log('📝 Step 1: Exchanging code for OpenRouter API key...');
    const openRouterApiKey = await exchangeCodeForOpenRouterKey(
      code,
      stateData.code_verifier
    );
    
    if (!openRouterApiKey) {
      console.error('❌ No API key received');
      return redirectWithError('no_api_key');
    }
    
    console.log('✅ OpenRouter API key received');
    
    // Save to database
    console.log('📝 Step 2: Saving to database...');
    const savedCredential = await db.socialCredential.upsert({
      where: {
        userId_provider_tokenSource: {
          userId: stateData.user_id,
          provider: 'openrouter',
          tokenSource: 'openrouter_pkce',
        },
      },
      create: {
        userId: stateData.user_id,
        provider: 'openrouter',
        providerUserId: `openrouter_${stateData.user_id}`,
        accessToken: openRouterApiKey,
        tokenType: 'Bearer',
        tokenSource: 'openrouter_pkce',
      },
      update: {
        accessToken: openRouterApiKey,
        updatedAt: new Date(),
        injectionError: null,
      },
    });
    
    console.log('✅ Credentials saved:', savedCredential.id);
    
    // Get user N8N info
    console.log('📝 Step 3: Getting user N8N configuration...');
    const user = await db.user.findUnique({
      where: { id: stateData.user_id },
      select: {
        n8nUrl: true,
        n8nUserEmail: true,
        n8nEncryptionKey: true,
        email: true,
        northflankProjectStatus: true,
      },
    });
    
    if (!user) {
      console.error('❌ User not found');
      return redirectWithError('user_not_found');
    }
    
    // Inject to N8N (if ready)
    if (
      user.n8nUrl &&
      user.n8nEncryptionKey &&
      user.northflankProjectStatus === 'ready'
    ) {
      console.log('📝 Step 4: Injecting to N8N...');
      
      try {
        const n8nEmail = user.n8nUserEmail || user.email;
        const n8nPassword = `7On${user.n8nEncryptionKey}`;
        const n8nUrl = user.n8nUrl.replace(/\/$/, '');
        
        // Login to N8N
        console.log('🔐 Logging into N8N...');
        const cookies = await loginToN8N(n8nUrl, n8nEmail, n8nPassword);
        
        if (!cookies) {
          throw new Error('Failed to get N8N session cookies');
        }
        
        console.log('✅ N8N login successful');
        
        // Create OpenRouter credential
        const credentialId = await createOpenRouterCredentialInN8n(
          n8nUrl,
          cookies,
          openRouterApiKey,
          stateData.user_id
        );
        
        // Update database
        await db.socialCredential.update({
          where: { id: savedCredential.id },
          data: {
            injectedToN8n: !!credentialId,
            injectedAt: credentialId ? new Date() : null,
            n8nCredentialIds: credentialId ? [credentialId] : [],
            injectionError: credentialId ? null : 'Failed to create N8N credential',
          },
        });
        
        console.log('✅ N8N injection complete');
        
      } catch (n8nError) {
        console.error('❌ N8N injection failed:', n8nError);
        
        await db.socialCredential.update({
          where: { id: savedCredential.id },
          data: {
            injectionError: (n8nError as Error).message,
          },
        });
      }
    } else {
      console.log('⏭️ Skipping N8N injection - prerequisites not met');
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`✅ OpenRouter flow completed in ${elapsed}ms`);
    
    return NextResponse.redirect(
      `${APP_URL}/dashboard?connected=openrouter&status=success&timestamp=${Date.now()}`
    );
    
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`💥 OpenRouter callback error after ${elapsed}ms:`, err);
    const errorMessage = err instanceof Error ? err.message : 'unknown_error';
    return redirectWithError(errorMessage);
  }
}

// Helper functions
async function loginToN8N(
  n8nUrl: string,
  email: string,
  password: string
): Promise<string> {
  const response = await fetch(`${n8nUrl}/rest/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emailOrLdapLoginId: email,
      password,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`N8N login failed: ${response.status}`);
  }
  
  const cookies = response.headers.get('set-cookie');
  if (!cookies) {
    throw new Error('No cookies received from N8N login');
  }
  
  return cookies;
}

function redirectWithError(errorMessage: string) {
  console.error('Redirecting with error:', errorMessage);
  return NextResponse.redirect(
    `${APP_URL}/dashboard?error=${encodeURIComponent(errorMessage)}&timestamp=${Date.now()}`
  );
}