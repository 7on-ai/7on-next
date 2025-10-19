// app/api/oauth-callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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

    if (error) {
      return redirectWithError(`oauth_error: ${error}`);
    }

    if (!code || !state) {
      return redirectWithError('missing_parameters');
    }

    // Decode state
    const stateData = JSON.parse(atob(state));
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return redirectWithError('state_expired');
    }

    // Exchange code for tokens
    const tokenData = await exchangeCodeForTokens(code, stateData.service);

    // Get IDP tokens from Auth0
    let idpTokens = {
      idp_access_token: null,
      idp_refresh_token: null,
      provider_user_id: null,
    };

    if (tokenData.id_token) {
      try {
        idpTokens = await getIdentityProviderTokens(tokenData.id_token, stateData.service);
        console.log('✅ IDP tokens obtained');
      } catch (err) {
        console.error('❌ IDP token error:', err);
      }
    }

    const combinedTokenData = {
      ...tokenData,
      ...idpTokens,
    };

    // Save credentials to database
    await db.socialCredential.upsert({
      where: {
        userId_provider_tokenSource: {
          userId: stateData.user_id,
          provider: stateData.service,
          tokenSource: 'identity_provider',
        },
      },
      create: {
        userId: stateData.user_id,
        provider: stateData.service,
        providerUserId: idpTokens.provider_user_id || `${stateData.service}_${stateData.user_id}`,
        accessToken: idpTokens.idp_access_token || tokenData.access_token,
        refreshToken: idpTokens.idp_refresh_token || tokenData.refresh_token,
        tokenType: 'Bearer',
        expiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
        clientId: getClientId(stateData.service),
        clientSecret: getClientSecret(stateData.service),
        tokenSource: 'identity_provider',
      },
      update: {
        accessToken: idpTokens.idp_access_token || tokenData.access_token,
        refreshToken: idpTokens.idp_refresh_token || tokenData.refresh_token,
        expiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
        updatedAt: new Date(),
      },
    });

    console.log('✅ Credentials saved to database');

    // Get user N8N info
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

    // If N8N is ready, inject credentials
    if (user?.n8nUrl && user.northflankProjectStatus === 'ready') {
      try {
        const n8nPassword = `7On${user.n8nEncryptionKey}`;
        const cookies = await loginToN8N(
          user.n8nUrl,
          user.n8nUserEmail || user.email,
          n8nPassword
        );

        const credentialResults = await createGoogleCredentials(
          user.n8nUrl,
          cookies,
          combinedTokenData
        );

        // Mark as injected
        await db.socialCredential.updateMany({
          where: {
            userId: stateData.user_id,
            provider: stateData.service,
          },
          data: {
            injectedToN8n: true,
            injectedAt: new Date(),
            n8nCredentialIds: credentialResults.results
              .filter((r: any) => r.success)
              .map((r: any) => r.id),
          },
        });

        console.log('✅ Credentials injected to N8N');
      } catch (n8nError) {
        console.error('❌ N8N injection failed:', n8nError);
        await db.socialCredential.updateMany({
          where: {
            userId: stateData.user_id,
            provider: stateData.service,
          },
          data: {
            injectionError: (n8nError as Error).message,
          },
        });
      }
    }

    return NextResponse.redirect(
      `${CONFIG.APP_URL}/dashboard?connected=${stateData.service}&status=success&timestamp=${Date.now()}`
    );
  } catch (err) {
    console.error('💥 OAuth callback error:', err);
    return redirectWithError((err as Error).message || 'unknown_error');
  }
}

// ===== HELPER FUNCTIONS =====

async function exchangeCodeForTokens(code: string, service: string) {
  const clientId = getClientId(service);
  const clientSecret = getClientSecret(service);

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
    throw new Error('Token exchange failed');
  }

  return await response.json();
}

async function getIdentityProviderTokens(idToken: string, service: string) {
  const tokenParts = idToken.split('.');
  const payload = JSON.parse(atob(tokenParts[1]));
  const auth0UserId = payload.sub;

  // Get Management API token
  const mgmtToken = await getAuth0ManagementToken();

  // Fetch user profile
  const response = await fetch(
    `https://${CONFIG.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0UserId)}?fields=identities`,
    {
      headers: { Authorization: `Bearer ${mgmtToken}` },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch user profile');
  }

  const userProfile = await response.json();

  const providerMap: Record<string, string> = {
    google: 'google-oauth2',
    spotify: 'spotify',
    discord: 'discord',
    github: 'github',
    linkedin: 'linkedin',
  };

  const auth0Provider = providerMap[service] || service;
  const identity = userProfile.identities?.find((id: any) => id.provider === auth0Provider);

  if (!identity) {
    console.warn('⚠️ No identity found for:', auth0Provider);
    return {
      idp_access_token: null,
      idp_refresh_token: null,
      provider_user_id: null,
    };
  }

  return {
    idp_access_token: identity.access_token,
    idp_refresh_token: identity.refresh_token,
    provider_user_id: identity.user_id,
  };
}

async function getAuth0ManagementToken() {
  const response = await fetch(`https://${CONFIG.AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: process.env.AUTH0_M2M_CLIENT_ID!,
      client_secret: process.env.AUTH0_M2M_CLIENT_SECRET!,
      audience: `https://${CONFIG.AUTH0_DOMAIN}/api/v2/`,
      scope: 'read:users read:user_idp_tokens',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to get Management API token');
  }

  const data = await response.json();
  return data.access_token;
}

async function loginToN8N(n8nUrl: string, email: string, password: string) {
  const response = await fetch(`${n8nUrl}/rest/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emailOrLdapLoginId: email,
      password,
    }),
  });

  const cookies = response.headers.get('set-cookie');
  if (!cookies) {
    throw new Error('No cookies received from N8N login');
  }

  return cookies;
}

async function createGoogleCredentials(
  n8nUrl: string,
  cookies: string,
  tokenData: any
) {
  const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID!;
  const googleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;

  const configs = [
    {
      type: 'googleOAuth2Api',
      name: 'Google OAuth2',
      scope:
        'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.modify',
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
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          accessTokenUrl: 'https://oauth2.googleapis.com/token',
          scope: config.scope,
          grantType: 'authorizationCode',
          authentication: 'body',
          oauthTokenData: {
            access_token: tokenData.idp_access_token || tokenData.access_token,
            refresh_token: tokenData.idp_refresh_token || tokenData.refresh_token,
            token_type: 'Bearer',
            expires_in: 3600,
          },
        },
      }),
    });

    const result = response.ok ? await response.json() : null;
    results.push({
      type: config.type,
      success: response.ok,
      id: result?.data?.id,
    });

    console.log(response.ok ? `✅ ${config.type} created` : `❌ ${config.type} failed`);
  }

  return {
    results,
    summary: {
      successful: results.filter((r) => r.success).length,
    },
  };
}

function getClientId(service: string): string {
  const map: Record<string, string> = {
    google: process.env.NEXT_PUBLIC_AUTH0_GOOGLE_CLIENT_ID!,
    spotify: process.env.NEXT_PUBLIC_AUTH0_SPOTIFY_CLIENT_ID!,
    discord: process.env.NEXT_PUBLIC_AUTH0_DISCORD_CLIENT_ID!,
    github: process.env.NEXT_PUBLIC_AUTH0_GITHUB_CLIENT_ID!,
    linkedin: process.env.NEXT_PUBLIC_AUTH0_LINKEDIN_CLIENT_ID!,
  };
  return map[service];
}

function getClientSecret(service: string): string {
  const map: Record<string, string> = {
    google: process.env.AUTH0_GOOGLE_CLIENT_SECRET!,
    spotify: process.env.AUTH0_SPOTIFY_CLIENT_SECRET!,
    discord: process.env.AUTH0_DISCORD_CLIENT_SECRET!,
    github: process.env.AUTH0_GITHUB_CLIENT_SECRET!,
    linkedin: process.env.AUTH0_LINKEDIN_CLIENT_SECRET!,
  };
  return map[service];
}

function redirectWithError(errorMessage: string) {
  return NextResponse.redirect(
    `${CONFIG.APP_URL}/dashboard?error=${encodeURIComponent(errorMessage)}&timestamp=${Date.now()}`
  );
}