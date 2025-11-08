// apps/app/lib/vector-memory.ts
import { Client } from 'pg';

interface VectorMemoryConfig {
  connectionString: string;
  ollamaUrl?: string;
}

export class VectorMemory {
  private client: Client;
  private ollamaUrl: string;
  private embeddingModel: string = 'nomic-embed-text'; // 768 dimensions

  constructor(config: VectorMemoryConfig) {
    this.client = new Client({ connectionString: config.connectionString });
    
    // ✅ CRITICAL FIX: Use external URL for Vercel → Northflank communication
    // Internal URLs (*.internal) only work INSIDE Northflank
    this.ollamaUrl = config.ollamaUrl || process.env.OLLAMA_EXTERNAL_URL || process.env.OLLAMA_URL || 'http://ollama.internal:11434';
    
    console.log('🔗 Ollama URL:', this.ollamaUrl.replace(/\/\/.+@/, '//*****@')); // Hide credentials in logs
  }

  async connect() {
    await this.client.connect();
  }

  /**
   * Generate embedding using Ollama (100% free, self-hosted)
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      console.log(`📡 Calling Ollama at: ${this.ollamaUrl}/api/embeddings`);
      
      const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embeddingModel,
          prompt: text,
        }),
        // Add timeout
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid embedding response from Ollama');
      }
      
      console.log(`✅ Generated ${data.embedding.length}-dim embedding`);
      return data.embedding;
    } catch (error) {
      console.error('❌ Error generating embedding:', error);
      
      // Better error message
      if (error instanceof Error) {
        if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
          throw new Error(`Cannot reach Ollama at ${this.ollamaUrl}. Make sure Ollama service has external access enabled in Northflank.`);
        }
        if (error.message.includes('ETIMEDOUT') || error.message.includes('timeout')) {
          throw new Error(`Ollama request timeout. Service might be starting or overloaded.`);
        }
      }
      
      throw new Error(`Ollama connection failed: ${(error as Error).message}`);
    }
  }

  /**
   * Add memory with vector embedding (Semantic search enabled)
   */
  async addMemory(userId: string, content: string, metadata?: any) {
    try {
      console.log(`🧠 Adding semantic memory for user ${userId}...`);
      
      // Generate embedding using Ollama
      const embedding = await this.generateEmbedding(content);
      
      // Validate embedding dimension (should be 768 for nomic-embed-text)
      if (embedding.length !== 768) {
        throw new Error(`Invalid embedding dimension: ${embedding.length}, expected 768`);
      }
      
      // Convert to pgvector format
      const vectorString = `[${embedding.join(',')}]`;
      
      // Store in memory_embeddings table with vector
      await this.client.query(
        `INSERT INTO user_data_schema.memory_embeddings 
         (user_id, content, embedding, metadata) 
         VALUES ($1, $2, $3::vector, $4)`,
        [userId, content, vectorString, JSON.stringify(metadata || {})]
      );

      console.log('✅ Semantic memory added with 768-dim embedding');
    } catch (error) {
      console.error('❌ Error adding memory:', error);
      throw error;
    }
  }

  /**
   * Semantic search using cosine similarity (pgvector)
   * Finds memories based on MEANING, not just keywords
   */
  async searchMemories(userId: string, query: string, limit = 10) {
    try {
      console.log(`🔍 Semantic search: "${query}"`);
      
      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(query);
      const vectorString = `[${queryEmbedding.join(',')}]`;
      
      // Search using cosine distance (<=>)
      // Lower distance = more similar
      const result = await this.client.query(
        `SELECT 
          id, 
          content, 
          metadata, 
          created_at,
          user_id,
          1 - (embedding <=> $1::vector) as score
         FROM user_data_schema.memory_embeddings
         WHERE user_id = $2
         ORDER BY embedding <=> $1::vector
         LIMIT $3`,
        [vectorString, userId, limit]
      );

      console.log(`✅ Found ${result.rows.length} semantically similar memories`);

      return result.rows.map(row => ({
        ...row,
        score: parseFloat(row.score),
      }));
    } catch (error) {
      console.error('❌ Semantic search error:', error);
      throw error;
    }
  }

  /**
   * Get all memories (no search)
   */
  async getAllMemories(userId: string) {
    const result = await this.client.query(
      `SELECT id, content, metadata, created_at, user_id
       FROM user_data_schema.memory_embeddings 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  /**
   * Delete memory
   */
  async deleteMemory(memoryId: string) {
    await this.client.query(
      `DELETE FROM user_data_schema.memory_embeddings WHERE id = $1`,
      [memoryId]
    );
  }

  /**
   * Get user context for AI (for N8N workflows)
   * Returns recent + semantically relevant memories
   */
  async getUserContext(userId: string, query?: string, limit = 5) {
    if (query) {
      // Semantic search
      return await this.searchMemories(userId, query, limit);
    } else {
      // Recent memories
      const result = await this.client.query(
        `SELECT id, content, metadata, created_at
         FROM user_data_schema.memory_embeddings 
         WHERE user_id = $1 
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit]
      );
      return result.rows;
    }
  }

  /**
   * Health check - verify Ollama is running
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async close() {
    await this.client.end();
  }
}

// Singleton instances (connection pooling)
const instances = new Map<string, VectorMemory>();

export async function getVectorMemory(connectionString: string, ollamaUrl?: string): Promise<VectorMemory> {
  const cacheKey = `${connectionString}:${ollamaUrl || 'default'}`;
  
  if (!instances.has(cacheKey)) {
    const instance = new VectorMemory({ connectionString, ollamaUrl });
    await instance.connect();
    instances.set(cacheKey, instance);
  }
  return instances.get(cacheKey)!;
}
