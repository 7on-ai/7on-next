// apps/app/lib/mem0-service.ts
import { Memory } from 'mem0ai';

interface Mem0Config {
  postgresHost: string;
  postgresPort: number;
  postgresDatabase: string;
  postgresUser: string;
  postgresPassword: string;
}

export class Mem0Service {
  private memory: Memory;

  constructor(config: Mem0Config) {
    this.memory = new Memory({
      vector_store: {
        provider: 'pgvector',
        config: {
          host: config.postgresHost,
          port: config.postgresPort,
          database: config.postgresDatabase,
          user: config.postgresUser,
          password: config.postgresPassword,
          collection_name: 'user_memories',
        },
      },
    });
  }

  async addMemory(userId: string, messages: Array<{ role: string; content: string }>) {
    return await this.memory.add(messages, { user_id: userId });
  }

  async searchMemories(userId: string, query: string, limit: number = 5) {
    return await this.memory.search(query, { user_id: userId, limit });
  }

  async getAll(userId: string) {
    return await this.memory.getAll({ user_id: userId });
  }

  async delete(memoryId: string) {
    return await this.memory.delete(memoryId);
  }

  async update(memoryId: string, data: any) {
    return await this.memory.update(memoryId, { data });
  }
}

// Singleton instance
let mem0Instance: Mem0Service | null = null;

export async function getMem0Instance(postgresConfig: Mem0Config): Promise<Mem0Service> {
  if (!mem0Instance) {
    mem0Instance = new Mem0Service(postgresConfig);
  }
  return mem0Instance;
}