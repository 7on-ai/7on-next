// apps/app/lib/postgres-setup.ts
import { Client } from 'pg';

/**
 * Initialize Postgres schema and tables for user memories
 */
export async function initializeUserPostgresSchema(connectionString: string): Promise<boolean> {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('✅ Connected to Postgres');
    
    // Create user_data_schema
    await client.query(`CREATE SCHEMA IF NOT EXISTS user_data_schema`);
    console.log('✅ Schema created: user_data_schema');
    
    // Create memories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.memories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        embedding vector(1536),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Table created: memories');
    
    // Create conversations table (optional)
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
    
    // Create indexes
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
    
    // Add triggers
    await client.query(`
      DROP TRIGGER IF EXISTS update_memories_updated_at ON user_data_schema.memories;
      CREATE TRIGGER update_memories_updated_at 
        BEFORE UPDATE ON user_data_schema.memories 
        FOR EACH ROW 
        EXECUTE FUNCTION user_data_schema.update_updated_at_column()
    `);
    
    await client.query(`
      DROP TRIGGER IF EXISTS update_conversations_updated_at ON user_data_schema.conversations;
      CREATE TRIGGER update_conversations_updated_at 
        BEFORE UPDATE ON user_data_schema.conversations 
        FOR EACH ROW 
        EXECUTE FUNCTION user_data_schema.update_updated_at_column()
    `);
    
    console.log('✅ Triggers created');
    
    return true;
  } catch (error) {
    console.error('❌ Error initializing postgres schema:', error);
    throw error;
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