// apps/app/lib/vector-memory.ts
import { Client } from 'pg';

interface VectorMemoryConfig {
  connectionString: string;
  openaiApiKey?: string;
}

export class VectorMemory {
  private client: Client;
  private openaiKey?: string;

  constructor(config: VectorMemoryConfig) {
    this.client = new Client({ connectionString: config.connectionString });
    this.openaiKey = config.openaiApiKey;
  }

  async connect() {
    await this.client.connect();
  }

  async addMemory(userId: string, content: string, metadata?: any) {
    await this.client.query(
      `INSERT INTO user_data_schema.memories (user_id, content, metadata) 
       VALUES ($1, $2, $3)`,
      [userId, content, JSON.stringify(metadata || {})]
    );
  }

  async searchMemories(userId: string, query: string, limit = 5) {
    const result = await this.client.query(
      `SELECT id, content, metadata, created_at, user_id,
              ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) as rank
       FROM user_data_schema.memories
       WHERE user_id = $2 
         AND to_tsvector('english', content) @@ plainto_tsquery('english', $1)
       ORDER BY rank DESC, created_at DESC
       LIMIT $3`,
      [query, userId, limit]
    );
    return result.rows;
  }

  async getAllMemories(userId: string) {
    const result = await client.query(
      `SELECT id, content, metadata, created_at, user_id
       FROM user_data_schema.memories 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  async deleteMemory(memoryId: string) {
    await this.client.query(
      `DELETE FROM user_data_schema.memories WHERE id = $1`,
      [memoryId]
    );
  }

  async close() {
    await this.client.end();
  }
}

const instances = new Map<string, VectorMemory>();

export async function getVectorMemory(connectionString: string): Promise<VectorMemory> {
  if (!instances.has(connectionString)) {
    const instance = new VectorMemory({ connectionString });
    await instance.connect();
    instances.set(connectionString, instance);
  }
  return instances.get(connectionString)!;
}
