// apps/app/lib/postgres-setup.ts
/**
 * ✅ Complete Postgres Setup with Two-Channel + MCL
 * รันเมื่อ user กด "Setup Database" ครั้งแรก
 * สร้างทั้ง semantic memory (เดิม) + two-channel tables (ใหม่)
 */

import { Client } from 'pg';

export async function initializeUserPostgresSchema(
  connectionString: string,
  adminConnectionString?: string
): Promise<boolean> {
  const setupConnectionString = adminConnectionString || connectionString;
  const client = new Client({ connectionString: setupConnectionString });
  
  try {
    await client.connect();
    console.log('✅ Connected to User Postgres Addon');
    
    // ========================================
    // STEP 1: Extensions & Schema
    // ========================================
    await client.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    console.log('✅ pgvector extension created');
    
    await client.query(`CREATE SCHEMA IF NOT EXISTS user_data_schema`);
    console.log('✅ Schema created: user_data_schema');
    
    // ========================================
    // STEP 2: Original Semantic Memory Tables
    // (เดิมที่มีอยู่แล้ว - เก็บไว้)
    // ========================================
    
    // 2.1 Memory Embeddings (768-dim for nomic-embed-text)
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
    console.log('✅ Table created: memory_embeddings');
    
    // 2.2 Memories (backup table)
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
    console.log('✅ Table created: memories');
    
    // 2.3 Conversations
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT,
        title TEXT,
        messages JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Table created: conversations');
    
    // ========================================
    // STEP 3: Two-Channel Tables (ใหม่)
    // ========================================
    
    // 3.1 Good Channel
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.stm_good (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        text TEXT NOT NULL,
        embedding vector(768),
        metadata JSONB DEFAULT '{}',
        valence TEXT DEFAULT 'positive',
        alignment_score FLOAT,
        quality_score FLOAT,
        approved_for_consolidation BOOLEAN DEFAULT FALSE,
        consolidation_batch_id UUID
      )
    `);
    console.log('✅ Table created: stm_good (Good Channel)');
    
    // 3.2 Bad Channel
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.stm_bad (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        text TEXT NOT NULL,
        embedding vector(768),
        metadata JSONB DEFAULT '{}',
        valence TEXT DEFAULT 'negative',
        severity_score FLOAT,
        toxicity_score FLOAT,
        shadow_tag TEXT,
        safe_counterfactual TEXT,
        approved_for_shadow_learning BOOLEAN DEFAULT FALSE,
        consolidation_batch_id UUID
      )
    `);
    console.log('✅ Table created: stm_bad (Bad Channel)');
    
    // 3.3 Review Channel
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.stm_review (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        text TEXT NOT NULL,
        embedding vector(768),
        metadata JSONB DEFAULT '{}',
        gating_reason TEXT,
        human_reviewed BOOLEAN DEFAULT FALSE,
        human_decision TEXT,
        reviewed_at TIMESTAMPTZ
      )
    `);
    console.log('✅ Table created: stm_review (Review Channel)');
    
    // 3.4 MCL Chains
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.mcl_chains (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        event_chain JSONB NOT NULL,
        intention_score FLOAT,
        necessity_score FLOAT,
        harm_score FLOAT,
        benefit_score FLOAT,
        moral_classification TEXT,
        summary TEXT,
        embedding vector(768),
        approved_for_training BOOLEAN DEFAULT FALSE
      )
    `);
    console.log('✅ Table created: mcl_chains (Moral Context Layer)');
    
    // 3.5 Semantic Memory (Consolidated)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.semantic_memory (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        summary TEXT NOT NULL,
        canonical_entry JSONB NOT NULL,
        embedding vector(768),
        valence TEXT,
        source_type TEXT,
        source_ids BIGINT[]
      )
    `);
    console.log('✅ Table created: semantic_memory (Consolidated)');
    
    // 3.6 Gating Logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data_schema.gating_logs (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        input_text TEXT NOT NULL,
        routing_decision TEXT,
        valence_scores JSONB,
        toxicity_score FLOAT,
        rules_triggered TEXT[],
        mcl_detected BOOLEAN DEFAULT FALSE
      )
    `);
    console.log('✅ Table created: gating_logs (Audit)');
    
    // ========================================
    // STEP 4: Indexes
    // ========================================
    
    const indexes = [
      // Original semantic memory indexes
      'CREATE INDEX IF NOT EXISTS idx_memory_embeddings_user ON user_data_schema.memory_embeddings(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_memory_embeddings_vector_hnsw ON user_data_schema.memory_embeddings USING hnsw (embedding vector_cosine_ops)',
      'CREATE INDEX IF NOT EXISTS idx_memories_user ON user_data_schema.memories(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_memories_created ON user_data_schema.memories(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_conversations_user ON user_data_schema.conversations(user_id)',
      
      // Two-channel indexes
      'CREATE INDEX IF NOT EXISTS idx_stm_good_user ON user_data_schema.stm_good(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_stm_good_approved ON user_data_schema.stm_good(approved_for_consolidation)',
      'CREATE INDEX IF NOT EXISTS idx_stm_good_created ON user_data_schema.stm_good(created_at DESC)',
      
      'CREATE INDEX IF NOT EXISTS idx_stm_bad_user ON user_data_schema.stm_bad(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_stm_bad_approved ON user_data_schema.stm_bad(approved_for_shadow_learning)',
      'CREATE INDEX IF NOT EXISTS idx_stm_bad_shadow_tag ON user_data_schema.stm_bad(shadow_tag)',
      
      'CREATE INDEX IF NOT EXISTS idx_stm_review_user ON user_data_schema.stm_review(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_stm_review_pending ON user_data_schema.stm_review(human_reviewed)',
      
      'CREATE INDEX IF NOT EXISTS idx_mcl_user ON user_data_schema.mcl_chains(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_mcl_classification ON user_data_schema.mcl_chains(moral_classification)',
      
      'CREATE INDEX IF NOT EXISTS idx_sm_user ON user_data_schema.semantic_memory(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_sm_embedding ON user_data_schema.semantic_memory USING hnsw (embedding vector_cosine_ops)',
      
      'CREATE INDEX IF NOT EXISTS idx_gating_logs_user ON user_data_schema.gating_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_gating_logs_decision ON user_data_schema.gating_logs(routing_decision)',
      'CREATE INDEX IF NOT EXISTS idx_gating_logs_created ON user_data_schema.gating_logs(created_at DESC)',
    ];
    
    for (const indexSql of indexes) {
      await client.query(indexSql);
    }
    console.log('✅ All indexes created');
    
    // ========================================
    // STEP 5: Triggers
    // ========================================
    
    await client.query(`
      CREATE OR REPLACE FUNCTION user_data_schema.update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);
    
    // Triggers for original tables
    await client.query(`
      DROP TRIGGER IF EXISTS update_memory_embeddings_updated_at ON user_data_schema.memory_embeddings;
      CREATE TRIGGER update_memory_embeddings_updated_at 
        BEFORE UPDATE ON user_data_schema.memory_embeddings 
        FOR EACH ROW 
        EXECUTE FUNCTION user_data_schema.update_updated_at_column()
    `);
    
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
    
    // ========================================
    // STEP 6: Permissions (if using admin connection)
    // ========================================
    
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
    
    console.log('🎉 Complete schema initialization (Semantic Memory + Two-Channel + MCL) completed!');
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