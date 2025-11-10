// apps/app/app/api/ollama/setup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const OLLAMA_URL = process.env.OLLAMA_EXTERNAL_URL!;

/**
 * Check Ollama health and pull models if needed
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔍 Checking Ollama health...');

    // 1. Check if Ollama is running
    try {
      const healthCheck = await fetch(`${OLLAMA_URL}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });

      if (!healthCheck.ok) {
        return NextResponse.json({
          success: false,
          error: 'Ollama service not responding',
          status: 'offline',
        });
      }

      const data = await healthCheck.json();
      const models = data.models || [];
      
      console.log('✅ Ollama is running');
      console.log(`📋 Found ${models.length} models:`, models.map((m: any) => m.name));

      // 2. Check if nomic-embed-text exists
      const hasNomicEmbed = models.some((m: any) => 
        m.name.includes('nomic-embed-text')
      );

      if (!hasNomicEmbed) {
        console.log('📥 nomic-embed-text not found, pulling...');
        
        // Pull model (this will take time)
        const pullResponse = await fetch(`${OLLAMA_URL}/api/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'nomic-embed-text' }),
          signal: AbortSignal.timeout(300000), // 5 minutes
        });

        if (!pullResponse.ok) {
          throw new Error('Failed to pull model');
        }

        return NextResponse.json({
          success: true,
          message: 'Model is being pulled',
          status: 'pulling',
          models: models.map((m: any) => m.name),
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Ollama is ready',
        status: 'ready',
        models: models.map((m: any) => m.name),
      });

    } catch (fetchError) {
      console.error('❌ Ollama connection error:', fetchError);
      return NextResponse.json({
        success: false,
        error: 'Cannot connect to Ollama',
        status: 'unreachable',
        details: (fetchError as Error).message,
      });
    }

  } catch (error) {
    console.error('❌ Setup error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: (error as Error).message,
        status: 'error',
      },
      { status: 500 }
    );
  }
}

/**
 * Get Ollama status (GET)
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return NextResponse.json({
        status: 'offline',
        models: [],
      });
    }

    const data = await response.json();
    const models = data.models || [];

    return NextResponse.json({
      status: 'online',
      models: models.map((m: any) => ({
        name: m.name,
        size: m.size,
        modified: m.modified_at,
      })),
      hasNomicEmbed: models.some((m: any) => 
        m.name.includes('nomic-embed-text')
      ),
    });

  } catch (error) {
    return NextResponse.json({
      status: 'unreachable',
      models: [],
      error: (error as Error).message,
    });
  }
}