// apps/app/lib/n8n-credentials.ts

interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

interface CreateCredentialParams {
  n8nUrl: string;
  n8nEmail: string;
  n8nPassword: string;
  postgresConfig: PostgresConfig;
}

/**
 * Login to N8N and get session cookies
 */
async function loginToN8N(
  n8nUrl: string,
  email: string,
  password: string
): Promise<string | null> {
  try {
    console.log('🔐 Logging into N8N:', { url: n8nUrl, email });
    
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
      console.error('❌ N8N login failed:', response.status, errorText);
      return null;
    }

    const cookies = response.headers.get('set-cookie');
    if (!cookies) {
      console.error('❌ No cookies received from N8N login');
      return null;
    }

    console.log('✅ N8N login successful');
    return cookies;
  } catch (error) {
    console.error('❌ N8N login error:', error);
    return null;
  }
}

/**
 * Create Postgres credential in N8N using cookies
 */
export async function createPostgresCredentialInN8n(
  params: CreateCredentialParams
): Promise<string | null> {
  try {
    console.log('📝 Creating Postgres credential in N8N...');
    
    // Step 1: Login to N8N
    const cookies = await loginToN8N(
      params.n8nUrl,
      params.n8nEmail,
      params.n8nPassword
    );

    if (!cookies) {
      throw new Error('Failed to get N8N session cookies');
    }

    // Step 2: Create Postgres credential
    const response = await fetch(`${params.n8nUrl}/rest/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookies,
      },
      body: JSON.stringify({
        name: `User Postgres DB - ${new Date().toISOString().slice(0, 16)}`,
        type: 'postgres',
        data: {
          host: params.postgresConfig.host,
          port: params.postgresConfig.port,
          database: params.postgresConfig.database,
          user: params.postgresConfig.user,
          password: params.postgresConfig.password,
          schema: 'user_data_schema',
          ssl: { rejectUnauthorized: false },
          connectionTimeout: 30000,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to create Postgres credential:', errorText);
      return null;
    }

    const result = await response.json();
    const credentialId = result?.data?.id || result?.id;

    if (!credentialId) {
      console.error('❌ No credential ID returned from N8N');
      return null;
    }

    console.log('✅ Postgres credential created:', credentialId);
    return credentialId;
  } catch (error) {
    console.error('❌ Error creating Postgres credential:', error);
    return null;
  }
}

/**
 * Verify Postgres credential in N8N
 */
export async function verifyPostgresCredential(
  n8nUrl: string,
  n8nEmail: string,
  n8nPassword: string,
  credentialId: string
): Promise<boolean> {
  try {
    const cookies = await loginToN8N(n8nUrl, n8nEmail, n8nPassword);
    if (!cookies) return false;

    const response = await fetch(`${n8nUrl}/rest/credentials/${credentialId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookies,
      },
    });

    if (!response.ok) {
      console.error('❌ Failed to verify credential');
      return false;
    }

    const credential = await response.json();
    console.log('✅ Credential verified:', credential.data?.name);
    return true;
  } catch (error) {
    console.error('❌ Error verifying credential:', error);
    return false;
  }
}