// apps/app/lib/postgres-setup.ts
import { Client } from 'pg';

/**
 * Initialize Postgres schema with pgvector for semantic memory
 * ✅ 768 dimensions for nomic-embed-text (Ollama)
 * ✅ HNSW index for fast vector search
 */
export async function initializeUserPostgresSchema(
  connectionString: string,
  adminConnectionString?: string
): Promise<boolean> {
  const setupConnectionString = adminConnectionString || connectionString;
  const client = new Client({ connectionString: setupConnectionString });
  
  try {
    await client.connect();
    console.log('✅ Connected to Postgres');
    
    // ===== 1. Create pgvector extension =====
    await client.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    console.log('✅ pgvector extension created');
    
    // ===== 2. Create schema =====
    await client.query(`CREATE SCHEMA IF NOT EXISTS user_data_schema`);
    console.log('✅ Schema created: user_data_schema');
    
    // ===== 3. Create memory_embeddings table (768-dim for nomic-embed-text) =====
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.memory_embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding vector(768),
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Table created: memory_embeddings (768-dim vectors)');
    
    // ===== 4. Create backup memories table (optional, for non-vector data) =====
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.memories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Table created: memories (backup table)');
    
    // ===== 5. Create conversations table =====
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
    
    // ===== 6. Create indexes for memory_embeddings =====
    
    // User ID index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_embeddings_user 
      ON user_data_schema.memory_embeddings(user_id)
    `);
    
    // HNSW vector index (better than IVFFlat for small-medium datasets)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_embeddings_vector_hnsw 
      ON user_data_schema.memory_embeddings 
      USING hnsw (embedding vector_cosine_ops)
    `);
    console.log('✅ Vector HNSW index created (fast semantic search)');
    
    // ===== 7. Create indexes for memories table =====
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_created 
      ON user_data_schema.memories(created_at DESC)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_user 
      ON user_data_schema.memories(user_id)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_metadata 
      ON user_data_schema.memories USING GIN (metadata)
    `);
    
    // Full-text search index (fallback)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memories_fts 
      ON user_data_schema.memories 
      USING gin(to_tsvector('english', content))
    `);
    
    console.log('✅ All indexes created');
    
    // ===== 8. Create updated_at trigger function =====
    await client.query(`
      CREATE OR REPLACE FUNCTION user_data_schema.update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);
    
    // ===== 9. Add triggers =====
    
    // memory_embeddings trigger
    await client.query(`
      DROP TRIGGER IF EXISTS update_memory_embeddings_updated_at 
      ON user_data_schema.memory_embeddings;
      
      CREATE TRIGGER update_memory_embeddings_updated_at 
        BEFORE UPDATE ON user_data_schema.memory_embeddings 
        FOR EACH ROW 
        EXECUTE FUNCTION user_data_schema.update_updated_at_column()
    `);
    
    // memories trigger
    await client.query(`
      DROP TRIGGER IF EXISTS update_memories_updated_at 
      ON user_data_schema.memories;
      
      CREATE TRIGGER update_memories_updated_at 
        BEFORE UPDATE ON user_data_schema.memories 
        FOR EACH ROW 
        EXECUTE FUNCTION user_data_schema.update_updated_at_column()
    `);
    
    // conversations trigger
    await client.query(`
      DROP TRIGGER IF EXISTS update_conversations_updated_at 
      ON user_data_schema.conversations;
      
      CREATE TRIGGER update_conversations_updated_at 
        BEFORE UPDATE ON user_data_schema.conversations 
        FOR EACH ROW 
        EXECUTE FUNCTION user_data_schema.update_updated_at_column()
    `);
    
    console.log('✅ Triggers created');
    
    // ===== 10. Grant permissions (if using admin connection) =====
    if (adminConnectionString && adminConnectionString !== connectionString) {
      const regularConfig = parsePostgresUrl(connectionString);
      
      if (regularConfig?.user) {
        console.log(`📝 Granting permissions to user: ${regularConfig.user}`);
        
        await client.query(`GRANT USAGE ON SCHEMA user_data_schema TO ${regularConfig.user}`);
        await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA user_data_schema TO ${regularConfig.user}`);
        await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA user_data_schema TO ${regularConfig.user}`);
        await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA user_data_schema GRANT ALL ON TABLES TO ${regularConfig.user}`);
        await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA user_data_schema GRANT ALL ON SEQUENCES TO ${regularConfig.user}`);
        
        console.log('✅ Permissions granted');
      }
    }
    
    console.log('🎉 Postgres schema initialization completed!');
    return true;
  } catch (error) {
    console.error('❌ Error initializing schema:', error);
    return false;
  } finally {
    await client.end();
    console.log('✅ Connection closed');
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
    console.error('❌ Connection test failed:', error);
    return false;
  } finally {
    await client.end();
  }
}

/**
 * Parse Postgres URL
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