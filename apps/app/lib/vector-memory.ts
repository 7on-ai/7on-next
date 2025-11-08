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
    // ใช้ internal URL สำหรับ Northflank
    this.ollamaUrl = config.ollamaUrl || process.env.OLLAMA_URL || 'http://ollama.internal:11434';
  }

  async connect() {
    await this.client.connect();
  }

  /**
   * Generate embedding using Ollama (100% free, self-hosted)
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embeddingModel,
          prompt: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.embedding;
    } catch (error) {
      console.error('❌ Error generating embedding:', error);
      throw new Error(`Ollama connection failed at ${this.ollamaUrl}: ${(error as Error).message}`);
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

export async function getVectorMemory(connectionString: string): Promise<VectorMemory> {
  if (!instances.has(connectionString)) {
    const instance = new VectorMemory({ connectionString });
    await instance.connect();
    instances.set(connectionString, instance);
  }
  return instances.get(connectionString)!;
}