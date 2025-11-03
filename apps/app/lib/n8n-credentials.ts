// apps/app/lib/n8n-credentials.ts - WITH RETRY LOGIC
interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

interface CreatePostgresCredentialParams {
  n8nUrl: string;
  n8nEmail: string;
  n8nPassword: string;
  postgresConfig: PostgresConfig;
}

/**
 * Login to N8N and get session cookies with retry logic
 */
async function loginToN8N(
  n8nUrl: string,
  email: string,
  password: string,
  maxRetries = 5,
  retryDelay = 10000
): Promise<string> {
  console.log('🔐 Logging into N8N:', { url: n8nUrl, email });
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries}...`);
      
      const response = await fetch(`${n8nUrl}/rest/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailOrLdapLoginId: email,
          password,
        }),
      });

      if (response.status === 503) {
        console.log(`⏳ N8N not ready yet (503), waiting ${retryDelay/1000}s before retry ${attempt}/${maxRetries}...`);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ N8N login failed (${response.status}):`, errorText);
        
        if (attempt < maxRetries) {
          console.log(`Retrying in ${retryDelay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        
        throw new Error(`N8N login failed after ${maxRetries} attempts: ${response.status}`);
      }

      const cookies = response.headers.get('set-cookie');
      if (!cookies) {
        throw new Error('No cookies received from N8N login');
      }

      console.log('✅ N8N login successful');
      return cookies;
      
    } catch (error) {
      console.error(`❌ Attempt ${attempt} error:`, error);
      
      if (attempt < maxRetries) {
        console.log(`Retrying in ${retryDelay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw new Error('Failed to get N8N session cookies');
}

/**
 * Create Postgres credential in N8N
 */
export async function createPostgresCredentialInN8n({
  n8nUrl,
  n8nEmail,
  n8nPassword,
  postgresConfig,
}: CreatePostgresCredentialParams): Promise<string | null> {
  try {
    console.log('📝 Creating Postgres credential in N8N...');
    
    const cookies = await loginToN8N(n8nUrl, n8nEmail, n8nPassword);
    
    console.log('📝 Creating credential via N8N API...');
    
    const credentialResponse = await fetch(`${n8nUrl}/rest/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookies,
      },
      body: JSON.stringify({
        name: `User Postgres - ${new Date().toISOString().slice(0, 16)}`,
        type: 'postgres',
        data: {
          host: postgresConfig.host,
          port: postgresConfig.port,
          database: postgresConfig.database,
          user: postgresConfig.user,
          password: postgresConfig.password,
          ssl: 'allow',
          schema: 'user_data_schema',
        },
      }),
    });

    if (!credentialResponse.ok) {
      const errorText = await credentialResponse.text();
      console.error('❌ Failed to create credential:', errorText);
      throw new Error(`Failed to create credential: ${credentialResponse.status}`);
    }

    const result = await credentialResponse.json();
    const credentialId = result?.data?.id;
    
    if (!credentialId) {
      console.error('❌ No credential ID in response:', result);
      throw new Error('No credential ID returned');
    }
    
    console.log('✅ Postgres credential created:', credentialId);
    return credentialId;
    
  } catch (error) {
    console.error('❌ Error creating Postgres credential:', error);
    throw error;
  }
}