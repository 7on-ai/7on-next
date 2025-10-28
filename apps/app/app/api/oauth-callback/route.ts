// app/api/oauth-callback/route.ts - COMPLETE FIXED VERSION
import { NextRequest, NextResponse } from 'next/server';
import { database as db } from '@repo/database';

const CONFIG = {
  AUTH0_DOMAIN: process.env.NEXT_PUBLIC_AUTH0_DOMAIN!,
  APP_URL: process.env.NEXT_PUBLIC_APP_URL!,
};

export async function GET(request: NextRequest) {
  try {
    console.log('🚀 OAuth callback started');
    
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // ===== HANDLE ERRORS =====
    if (error) {
      console.error('❌ OAuth error:', error);
      return redirectWithError(`oauth_error: ${error}`);
    }

    if (!code || !state) {
      console.error('❌ Missing parameters');
      return redirectWithError('missing_parameters');
    }

    // ===== DECODE STATE =====
    let stateData: { user_id: string; service: string; timestamp: number };
    try {
      stateData = JSON.parse(atob(state));
      console.log('✅ State decoded:', { service: stateData.service, userId: stateData.user_id });
      
      // Check expiration (15 minutes)
      if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
        throw new Error('State expired');
      }
    } catch (err) {
      console.error('❌ Invalid or expired state:', err);
      return redirectWithError('invalid_state');
    }

    // ===== STEP 1: EXCHANGE CODE FOR AUTH0 TOKENS =====
    console.log('📝 Step 1: Exchanging authorization code with Auth0...');
    const tokenData = await exchangeCodeForAuth0Tokens(code, stateData.service);
    
    if (!tokenData?.access_token) {
      console.error('❌ No access token from Auth0');
      return redirectWithError('no_access_token');
    }

    console.log('✅ Auth0 tokens received');

    // ===== STEP 2: GET IDP TOKENS FROM AUTH0 MANAGEMENT API =====
    console.log('📝 Step 2: Getting IDP tokens from Auth0 Management API...');
    let idpTokens = {
      idp_access_token: null as string | null,
      idp_refresh_token: null as string | null,
      provider_user_id: null as string | null,
    };

    if (tokenData.id_token) {
      try {
        idpTokens = await getIdentityProviderTokens(
          tokenData.id_token,
          stateData.service
        );
        
        if (idpTokens.idp_access_token) {
          console.log('✅ IDP tokens obtained:', {
            hasAccess: !!idpTokens.idp_access_token,
            hasRefresh: !!idpTokens.idp_refresh_token,
          });
        } else {
          console.warn('⚠️ No IDP tokens found, using Auth0 tokens as fallback');
        }
      } catch (err) {
        console.error('❌ Failed to get IDP tokens:', err);
        console.log('⚠️ Continuing with Auth0 tokens only');
      }
    }

    // Combine tokens - prefer IDP tokens, fallback to Auth0 tokens
    const finalAccessToken = idpTokens.idp_access_token || tokenData.access_token;
    const finalRefreshToken = idpTokens.idp_refresh_token || tokenData.refresh_token;
    const hasIdpTokens = !!idpTokens.idp_access_token;

    console.log('Token selection:', {
      usingIdpTokens: hasIdpTokens,
      hasRefreshToken: !!finalRefreshToken,
    });

    // ===== STEP 3: GET PROVIDER CLIENT CREDENTIALS =====
    const clientId = getProviderClientId(stateData.service);
    const clientSecret = getProviderClientSecret(stateData.service);

    if (!clientId || !clientSecret) {
      console.error('❌ Missing provider client credentials for:', stateData.service);
      return redirectWithError('missing_provider_credentials');
    }

    console.log('✅ Provider client credentials loaded');

    // ===== STEP 4: SAVE TO DATABASE =====
    console.log('📝 Step 3: Saving credentials to database...');
    
    const savedCredential = await db.socialCredential.upsert({
      where: {
        userId_provider_tokenSource: {
          userId: stateData.user_id,
          provider: stateData.service,
          tokenSource: hasIdpTokens ? 'identity_provider' : 'auth0',
        },
      },
      create: {
        userId: stateData.user_id,
        provider: stateData.service,
        providerUserId: idpTokens.provider_user_id || `${stateData.service}_${stateData.user_id}`,
        accessToken: finalAccessToken,
        refreshToken: finalRefreshToken,
        tokenType: 'Bearer',
        expiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
        clientId,
        clientSecret,
        tokenSource: hasIdpTokens ? 'identity_provider' : 'auth0',
      },
      update: {
        accessToken: finalAccessToken,
        refreshToken: finalRefreshToken,
        providerUserId: idpTokens.provider_user_id || undefined,
        expiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
        clientId,
        clientSecret,
        tokenSource: hasIdpTokens ? 'identity_provider' : 'auth0',
        updatedAt: new Date(),
        injectionError: null, // Clear previous errors
      },
    });

    console.log('✅ Credentials saved:', savedCredential.id);

    // ===== STEP 5: GET USER N8N INFO =====
    console.log('📝 Step 4: Getting user N8N configuration...');
    
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

    // ===== STEP 6: INJECT TO N8N (IF READY) =====
    if (
      user.n8nUrl && 
      user.n8nEncryptionKey && 
      user.northflankProjectStatus === 'ready'
    ) {
      console.log('📝 Step 5: Injecting credentials to N8N...');
      console.log('N8N URL:', user.n8nUrl);

      try {
        const n8nEmail = user.n8nUserEmail || user.email;
        const n8nPassword = `7On${user.n8nEncryptionKey}`;

        // Remove trailing slash from URL
        const n8nUrl = user.n8nUrl.replace(/\/$/, '');

        // Login to N8N
        console.log('🔐 Logging into N8N...');
        const cookies = await loginToN8N(n8nUrl, n8nEmail, n8nPassword);
        
        if (!cookies) {
          throw new Error('Failed to get N8N session cookies');
        }

        console.log('✅ N8N login successful');

        // Prepare token data for N8N
        const n8nTokenData = {
          access_token: finalAccessToken!,
          refresh_token: finalRefreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        };

        // Create credentials based on provider
        let credentialResults;
        
        if (stateData.service === 'google') {
          console.log('📝 Creating Google credentials in N8N...');
          credentialResults = await createGoogleCredentials(
            n8nUrl,
            cookies,
            n8nTokenData
          );
        } else {
          console.log('📝 Creating generic OAuth2 credential in N8N...');
          credentialResults = await createGenericOAuth2Credential(
            n8nUrl,
            cookies,
            stateData.service,
            n8nTokenData
          );
        }

        // Extract successful credential IDs
        const successfulIds = credentialResults.results
          .filter((r: any) => r.success)
          .map((r: any) => r.id);

        // Update database with injection results
        await db.socialCredential.update({
          where: { id: savedCredential.id },
          data: {
            injectedToN8n: successfulIds.length > 0,
            injectedAt: successfulIds.length > 0 ? new Date() : null,
            n8nCredentialIds: successfulIds,
            injectionError: successfulIds.length === 0 
              ? 'All N8N credential creations failed' 
              : null,
          },
        });

        console.log(`✅ N8N injection complete: ${successfulIds.length}/${credentialResults.results.length} successful`);
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
      console.log('Status:', {
        hasUrl: !!user.n8nUrl,
        hasKey: !!user.n8nEncryptionKey,
        status: user.northflankProjectStatus,
      });
    }

    // ===== SUCCESS REDIRECT =====
    console.log('✅ OAuth flow completed successfully');
    
    return NextResponse.redirect(
      `${CONFIG.APP_URL}/dashboard?connected=${stateData.service}&status=success&timestamp=${Date.now()}`
    );
  } catch (err) {
    console.error('💥 OAuth callback error:', err);
    const errorMessage = err instanceof Error ? err.message : 'unknown_error';
    return redirectWithError(errorMessage);
  }
}

// ===== HELPER FUNCTIONS =====

/**
 * Exchange authorization code with Auth0 for tokens
 */
async function exchangeCodeForAuth0Tokens(
  code: string,
  service: string
): Promise<any> {
  const clientId = getAuth0ClientId(service);
  const clientSecret = getAuth0ClientSecret(service);

  if (!clientId || !clientSecret) {
    throw new Error(`Missing Auth0 credentials for ${service}`);
  }

  console.log('Exchanging code with Auth0...');
  
  const response = await fetch(`https://${CONFIG.AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${CONFIG.APP_URL}/api/oauth-callback`,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Token exchange failed:', response.status, errorText);
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  return await response.json();
}

/**
 * Get IDP tokens from Auth0 Management API
 */
async function getIdentityProviderTokens(
  idToken: string,
  service: string
): Promise<{
  idp_access_token: string | null;
  idp_refresh_token: string | null;
  provider_user_id: string | null;
}> {
  try {
    // Decode ID token to get Auth0 user ID
    const tokenParts = idToken.split('.');
    const payload = JSON.parse(atob(tokenParts[1]));
    const auth0UserId = payload.sub;

    console.log('Getting IDP tokens for Auth0 user:', auth0UserId);

    // Get Management API token
    const mgmtToken = await getAuth0ManagementToken();

    // Map service name to Auth0 connection name
    const providerMap: Record<string, string> = {
      google: 'google-oauth2',
      spotify: 'spotify',
      discord: 'discord',
      github: 'github',
      linkedin: 'linkedin',
    };

    const auth0Provider = providerMap[service] || service;

    // Fetch user profile with identities
    const response = await fetch(
      `https://${CONFIG.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0UserId)}?fields=identities`,
      {
        headers: { Authorization: `Bearer ${mgmtToken}` },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to fetch user profile:', errorText);
      throw new Error('Failed to fetch user profile');
    }

    const userProfile = await response.json();
    const identity = userProfile.identities?.find(
      (id: any) => id.provider === auth0Provider
    );

    if (!identity) {
      console.warn('⚠️ No identity found for provider:', auth0Provider);
      return {
        idp_access_token: null,
        idp_refresh_token: null,
        provider_user_id: null,
      };
    }

    console.log('✅ Identity found:', { provider: identity.provider });

    return {
      idp_access_token: identity.access_token || null,
      idp_refresh_token: identity.refresh_token || null,
      provider_user_id: identity.user_id || null,
    };
  } catch (error) {
    console.error('Error getting IDP tokens:', error);
    throw error;
  }
}

/**
 * Get Auth0 Management API token
 */
async function getAuth0ManagementToken(): Promise<string> {
  const m2mClientId = process.env.AUTH0_M2M_CLIENT_ID;
  const m2mClientSecret = process.env.AUTH0_M2M_CLIENT_SECRET;

  if (!m2mClientId || !m2mClientSecret) {
    throw new Error('Missing Auth0 M2M credentials');
  }

  console.log('Getting Auth0 Management API token...');
  
  const response = await fetch(`https://${CONFIG.AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: m2mClientId,
      client_secret: m2mClientSecret,
      audience: `https://${CONFIG.AUTH0_DOMAIN}/api/v2/`,
      scope: 'read:users read:user_idp_tokens',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to get Management API token:', errorText);
    throw new Error('Failed to get Management API token');
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Login to N8N and get session cookies
 */
async function loginToN8N(
  n8nUrl: string,
  email: string,
  password: string
): Promise<string> {
  console.log('Logging into N8N:', { url: n8nUrl, email });
  
  const response = await fetch(`${n8nUrl}/rest/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emailOrLdapLoginId: email,
      password,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('N8N login failed:', response.status, errorText);
    throw new Error(`N8N login failed: ${response.status}`);
  }

  const cookies = response.headers.get('set-cookie');
  if (!cookies) {
    throw new Error('No cookies received from N8N login');
  }

  console.log('✅ N8N login successful');
  return cookies;
}

/**
 * Create Google credentials in N8N
 */
async function createGoogleCredentials(
  n8nUrl: string,
  cookies: string,
  tokenData: {
    access_token: string;
    refresh_token: string | null;
    client_id: string;
    client_secret: string;
  }
) {
  const configs = [
    {
      type: 'googleOAuth2Api',
      name: 'Google OAuth2',
      scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.modify',
    },
    {
      type: 'gmailOAuth2',
      name: 'Gmail OAuth2',
      scope: 'https://www.googleapis.com/auth/gmail.modify',
    },
    {
      type: 'googleCalendarOAuth2Api',
      name: 'Google Calendar OAuth2',
      scope: 'https://www.googleapis.com/auth/calendar',
    },
  ];

  const results = [];

  for (const config of configs) {
    try {
      console.log(`Creating ${config.type} credential...`);
      
      const response = await fetch(`${n8nUrl}/rest/credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookies,
        },
        body: JSON.stringify({
          name: `${config.name} - ${new Date().toISOString().slice(0, 16)}`,
          type: config.type,
          data: {
            clientId: tokenData.client_id,
            clientSecret: tokenData.client_secret,
            authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
            accessTokenUrl: 'https://oauth2.googleapis.com/token',
            scope: config.scope,
            grantType: 'authorizationCode',
            authentication: 'body',
            oauthTokenData: {
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token || '',
              token_type: 'Bearer',
              expires_in: 3600,
            },
          },
        }),
      });

      if (response.ok) {
        const result = await response.json();
        results.push({
          type: config.type,
          success: true,
          id: result?.data?.id,
        });
        console.log(`✅ ${config.type} created`);
      } else {
        const errorText = await response.text();
        console.error(`❌ ${config.type} failed:`, errorText);
        results.push({
          type: config.type,
          success: false,
          error: errorText,
        });
      }
    } catch (error) {
      console.error(`❌ ${config.type} error:`, error);
      results.push({
        type: config.type,
        success: false,
        error: (error as Error).message,
      });
    }
  }

  return {
    results,
    summary: {
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    },
  };
}

/**
 * Create generic OAuth2 credential in N8N
 */
async function createGenericOAuth2Credential(
  n8nUrl: string,
  cookies: string,
  provider: string,
  tokenData: {
    access_token: string;
    refresh_token: string | null;
    client_id: string;
    client_secret: string;
  }
) {
  console.log(`Creating generic OAuth2 credential for ${provider}...`);

  const response = await fetch(`${n8nUrl}/rest/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies,
    },
    body: JSON.stringify({
      name: `${provider} OAuth2 - ${new Date().toISOString().slice(0, 16)}`,
      type: 'oAuth2Api',
      data: {
        clientId: tokenData.client_id,
        clientSecret: tokenData.client_secret,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || '',
        tokenType: 'Bearer',
        grantType: 'authorizationCode',
        authentication: 'body',
      },
    }),
  });

  if (response.ok) {
    const result = await response.json();
    console.log(`✅ Generic OAuth2 credential created for ${provider}`);
    return {
      results: [{
        type: 'oAuth2Api',
        success: true,
        id: result?.data?.id,
      }],
    };
  } else {
    const errorText = await response.text();
    console.error(`❌ Generic OAuth2 credential failed:`, errorText);
    return {
      results: [{
        type: 'oAuth2Api',
        success: false,
        error: errorText,
      }],
    };
  }
}

// ===== CREDENTIAL GETTERS =====

/**
 * Get Auth0 App Client ID (for token exchange with Auth0)
 */
function getAuth0ClientId(service: string): string {
  const map: Record<string, string> = {
    google: process.env.NEXT_PUBLIC_AUTH0_GOOGLE_CLIENT_ID!,
    spotify: process.env.NEXT_PUBLIC_AUTH0_SPOTIFY_CLIENT_ID!,
    discord: process.env.NEXT_PUBLIC_AUTH0_DISCORD_CLIENT_ID!,
    github: process.env.NEXT_PUBLIC_AUTH0_GITHUB_CLIENT_ID!,
    linkedin: process.env.NEXT_PUBLIC_AUTH0_LINKEDIN_CLIENT_ID!,
  };
  return map[service];
}

/**
 * Get Auth0 App Client Secret (for token exchange with Auth0)
 */
function getAuth0ClientSecret(service: string): string {
  const map: Record<string, string> = {
    google: process.env.AUTH0_GOOGLE_CLIENT_SECRET!,
    spotify: process.env.AUTH0_SPOTIFY_CLIENT_SECRET!,
    discord: process.env.AUTH0_DISCORD_CLIENT_SECRET!,
    github: process.env.AUTH0_GITHUB_CLIENT_SECRET!,
    linkedin: process.env.AUTH0_LINKEDIN_CLIENT_SECRET!,
  };
  return map[service];
}

/**
 * Get Provider Client ID (for N8N credentials)
 */
function getProviderClientId(service: string): string {
  const map: Record<string, string> = {
    google: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    spotify: process.env.SPOTIFY_CLIENT_ID!,
    discord: process.env.DISCORD_CLIENT_ID!,
    github: process.env.GITHUB_CLIENT_ID!,
    linkedin: process.env.LINKEDIN_CLIENT_ID!,
  };
  return map[service];
}

/**
 * Get Provider Client Secret (for N8N credentials)
 */
function getProviderClientSecret(service: string): string {
  const map: Record<string, string> = {
    google: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    spotify: process.env.SPOTIFY_CLIENT_SECRET!,
    discord: process.env.DISCORD_CLIENT_SECRET!,
    github: process.env.GITHUB_CLIENT_SECRET!,
    linkedin: process.env.LINKEDIN_CLIENT_SECRET!,
  };
  return map[service];
}

/**
 * Redirect with error
 */
function redirectWithError(errorMessage: string) {
  console.error('Redirecting with error:', errorMessage);
  return NextResponse.redirect(
    `${CONFIG.APP_URL}/dashboard?error=${encodeURIComponent(errorMessage)}&timestamp=${Date.now()}`
  );
}
