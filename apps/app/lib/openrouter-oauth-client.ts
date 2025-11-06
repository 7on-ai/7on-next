// apps/app/lib/openrouter-oauth-client.ts
// ✅ Browser-compatible PKCE implementation

interface OpenRouterPKCEState {
  user_id: string;
  code_verifier: string;
  timestamp: number;
}

/**
 * Generate random string for PKCE (Browser-compatible)
 */
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Base64URL encode (Browser-compatible)
 */
function base64UrlEncode(buffer: ArrayBuffer): string {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * SHA256 hash using Web Crypto API
 */
async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await crypto.subtle.digest('SHA-256', data);
}

/**
 * Generate code verifier and challenge for PKCE
 */
export async function generatePKCEChallenge(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  // Generate random code_verifier (43-128 characters)
  const codeVerifier = generateRandomString(64); // 128 hex chars
  
  // Create SHA256 hash of code_verifier
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64UrlEncode(hashed);
  
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
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/openrouter-callback`;
  
  // Store code_verifier in state for callback
  const state = btoa(JSON.stringify({
    user_id: userId,
    code_verifier: codeVerifier,
    timestamp: Date.now(),
  } as OpenRouterPKCEState));
  
  const params = new URLSearchParams({
    callback_url: callbackUrl, // ✅ ใช้ callback_url แทน redirect_uri
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });
  
  // ✅ ใช้ /auth endpoint (ไม่ใช่ /api/v1/auth/keys)
  return `https://openrouter.ai/auth?${params.toString()}`;
}

/**
 * Decode state from callback
 */
export function decodeOpenRouterState(state: string): OpenRouterPKCEState {
  try {
    return JSON.parse(atob(state));
  } catch (error) {
    throw new Error('Invalid OAuth state');
  }
}