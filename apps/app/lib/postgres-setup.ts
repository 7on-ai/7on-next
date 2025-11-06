// apps/app/lib/postgres-setup.ts
import { Client } from 'pg';

/**
 * Initialize Postgres schema and tables for user memories
 * ✅ Now supports both regular and admin connection strings
 * ✅ Added pgvector extension and memory_embeddings table
 */
export async function initializeUserPostgresSchema(
  connectionString: string,
  adminConnectionString?: string
): Promise<boolean> {
  // ✅ Use admin connection for schema creation if provided
  const setupConnectionString = adminConnectionString || connectionString;
  const client = new Client({ connectionString: setupConnectionString });
  
  try {
    await client.connect();
    console.log('✅ Connected to Postgres');
    
    // ✅ Create pgvector extension (must be done before creating tables with vector columns)
    await client.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    console.log('✅ pgvector extension created');
    
    // Create user_data_schema
    await client.query(`CREATE SCHEMA IF NOT EXISTS user_data_schema`);
    console.log('✅ Schema created: user_data_schema');
    
    // ✅ Create memory_embeddings table (for vector search)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.memory_embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Table created: memory_embeddings');
    
    // Create memories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.memories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT,  -- ✅ เพิ่มบรรทัดนี้
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Table created: memories');
    
    // Create conversations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT,
        messages JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Table created: conversations');
    
    // ✅ Create indexes for memory_embeddings
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_embeddings_user 
      ON user_data_schema.memory_embeddings(user_id)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_embeddings_vector 
      ON user_data_schema.memory_embeddings 
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);
    console.log('✅ Vector indexes created');
    
    // Create indexes for memories table
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_created 
      ON user_data_schema.memories(created_at DESC)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_metadata 
      ON user_data_schema.memories USING GIN (metadata)
    `);
    
    console.log('✅ Indexes created');
    
    // Create updated_at trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION user_data_schema.update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);
    
    // Add triggers for memories table
    await client.query(`
      DROP TRIGGER IF EXISTS update_memories_updated_at ON user_data_schema.memories;
      CREATE TRIGGER update_memories_updated_at 
        BEFORE UPDATE ON user_data_schema.memories 
        FOR EACH ROW 
        EXECUTE FUNCTION user_data_schema.update_updated_at_column()
    `);
    
    // Add triggers for conversations table
    await client.query(`
      DROP TRIGGER IF EXISTS update_conversations_updated_at ON user_data_schema.conversations;
      CREATE TRIGGER update_conversations_updated_at 
        BEFORE UPDATE ON user_data_schema.conversations 
        FOR EACH ROW 
        EXECUTE FUNCTION user_data_schema.update_updated_at_column()
    `);
    
    // ✅ Add triggers for memory_embeddings table
    await client.query(`
      DROP TRIGGER IF EXISTS update_memory_embeddings_updated_at ON user_data_schema.memory_embeddings;
      CREATE TRIGGER update_memory_embeddings_updated_at 
        BEFORE UPDATE ON user_data_schema.memory_embeddings 
        FOR EACH ROW 
        EXECUTE FUNCTION user_data_schema.update_updated_at_column()
    `);
    
    console.log('✅ Triggers created');

    await client.query(`
      ALTER TABLE user_data_schema.memories 
      ADD COLUMN IF NOT EXISTS user_id TEXT
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_user 
      ON user_data_schema.memories(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_fts 
      ON user_data_schema.memories 
      USING gin(to_tsvector('english', content))
    `);    
    
    // ✅ Grant permissions to regular user if using admin connection
    if (adminConnectionString && adminConnectionString !== connectionString) {
      const regularConfig = parsePostgresUrl(connectionString);
      
      if (regularConfig?.user) {
        console.log(`📝 Granting permissions to user: ${regularConfig.user}`);
        
        await client.query(`GRANT USAGE ON SCHEMA user_data_schema TO ${regularConfig.user}`);
        await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA user_data_schema TO ${regularConfig.user}`);
        await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA user_data_schema TO ${regularConfig.user}`);
        await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA user_data_schema GRANT ALL ON TABLES TO ${regularConfig.user}`);
        await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA user_data_schema GRANT ALL ON SEQUENCES TO ${regularConfig.user}`);
        
        console.log('✅ Permissions granted to regular user');
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error initializing postgres schema:', error);
    return false;
  } finally {
    await client.end();
    console.log('✅ Postgres connection closed');
  }
}

/**
 * Test connection to Postgres
 */
export async function testPostgresConnection(connectionString: string): Promise<boolean> {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    const result = await client.query('SELECT NOW()');
    console.log('✅ Postgres connection test passed:', result.rows[0]);
    return true;
  } catch (error) {
    console.error('❌ Postgres connection test failed:', error);
    return false;
  } finally {
    await client.end();
  }
}

/**
 * Parse Postgres connection URL
 */
function parsePostgresUrl(url: string) {
  try {
    const regex = /postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/;
    const match = url.match(regex);
    
    if (!match) return null;
    
    const [, user, password, host, port, database] = match;
    
    return {
      host,
      port: parseInt(port, 10),
      database,
      user,
      password,
    };
  } catch (error) {
    console.error('❌ Error parsing URL:', error);
    return null;
  }
}