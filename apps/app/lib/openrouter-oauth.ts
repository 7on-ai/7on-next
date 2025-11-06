import { randomBytes, createHash } from 'crypto';

interface OpenRouterPKCEState {
  user_id: string;
  code_verifier: string;
  timestamp: number;
}

/**
 * Generate code verifier and challenge for PKCE
 */
export function generatePKCEChallenge(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  // Generate random code_verifier (43-128 characters)
  const codeVerifier = randomBytes(32)
    .toString('base64url');
  
  // Create SHA256 hash of code_verifier
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  
  return { codeVerifier, codeChallenge };
}

/**
 * Build OpenRouter authorization URL
 */
export function buildOpenRouterAuthUrl(
  userId: string,
  codeVerifier: string,
  codeChallenge: string
): string {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/openrouter-callback`;
  
  // Store code_verifier for later use
  const state = btoa(JSON.stringify({
    user_id: userId,
    code_verifier: codeVerifier,
    timestamp: Date.now(),
  } as OpenRouterPKCEState));
  
  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });
  
  return `https://openrouter.ai/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for OpenRouter API key
 */
export async function exchangeCodeForOpenRouterKey(
  code: string,
  codeVerifier: string
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
      code_challenge_method: 'S256',
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }
  
  const data = await response.json();
  return data.key; // OpenRouter API key
}

/**
 * Create OpenRouter credential in N8N
 */
export async function createOpenRouterCredentialInN8n(
  n8nUrl: string,
  cookies: string,
  apiKey: string,
  userId: string
): Promise<string | null> {
  try {
    console.log('📝 Creating OpenRouter credential in N8N...');
    
    const response = await fetch(`${n8nUrl}/rest/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookies,
      },
      body: JSON.stringify({
        name: `OpenRouter - ${new Date().toISOString().slice(0, 16)}`,
        type: 'openRouterApi', // N8N credential type
        data: {
          apiKey: apiKey,
        },
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to create OpenRouter credential:', errorText);
      throw new Error(`Failed to create credential: ${response.status}`);
    }
    
    const result = await response.json();
    const credentialId = result?.data?.id;
    
    console.log('✅ OpenRouter credential created:', credentialId);
    return credentialId;
    
  } catch (error) {
    console.error('❌ Error creating OpenRouter credential:', error);
    throw error;
  }
}