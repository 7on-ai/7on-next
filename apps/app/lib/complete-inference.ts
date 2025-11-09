// apps/app/lib/complete-inference.ts
/**
 * Complete Inference Engine
 * - System prompt anchor
 * - RAG from semantic memory + MCL
 * - Runtime detectors
 * - Safe fallback
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// ===== Constitutional System Prompt =====
const CONSTITUTIONAL_PROMPT = `
=== CORE IDENTITY & ETHICS (IMMUTABLE) ===

You are a helpful, respectful AI assistant. These principles are fundamental:

1. HARM PREVENTION
   - Never provide information that could cause physical harm
   - Refuse requests for violence, self-harm, or harming others

2. RESPECT & DIGNITY
   - Treat all individuals with respect
   - Do not create hateful or discriminatory content

3. HONESTY & INTEGRITY
   - Be truthful and acknowledge uncertainties
   - Do not deceive or manipulate

4. PRIVACY & CONFIDENTIALITY
   - Protect user privacy
   - Respect confidentiality

5. LEGAL COMPLIANCE
   - Do not assist with illegal activities
   - Promote legal and ethical behavior

=== END CONSTITUTIONAL RULES ===
`;

// ===== Safe Response Templates =====
const SAFE_TEMPLATES = {
  violence: 'ฉันไม่สามารถให้คำแนะนำเกี่ยวกับความรุนแรงได้',
  illegal: 'ฉันไม่สามารถช่วยเหลือในกิจกรรมที่ผิดกฎหมายได้',
  self_harm: 'ฉันเป็นห่วงคุณมาก โปรดติดต่อสายด่วนสุขภาพจิต 1323',
  hate: 'ฉันไม่สร้างเนื้อหาที่เหยียดหยาม ทุกคนสมควรได้รับความเคารพ',
  manipulation: 'ฉันส่งเสริมการสื่อสารที่ตรงไปตรงมาและให้เกียรติ',
};

// ===== Detector Interface =====
interface Detector {
  predict(text: string): number; // 0-1 probability
}

class SimpleDetector implements Detector {
  private keywords: string[];
  
  constructor(keywords: string[]) {
    this.keywords = keywords;
  }
  
  predict(text: string): number {
    const textLower = text.toLowerCase();
    const matches = this.keywords.filter(k => textLower.includes(k)).length;
    return Math.min(matches / this.keywords.length, 1.0);
  }
}

// ===== Detector Store =====
const DETECTORS: Record<string, Detector> = {
  violence: new SimpleDetector(['kill', 'murder', 'hurt', 'harm', 'attack']),
  illegal: new SimpleDetector(['hack', 'steal', 'fraud', 'scam']),
  self_harm: new SimpleDetector(['suicide', 'kill myself', 'self-harm']),
  hate: new SimpleDetector(['racist', 'sexist', 'discriminate']),
  manipulation: new SimpleDetector(['manipulate', 'gaslight', 'deceive']),
};

// ===== RAG from Semantic Memory =====
async function retrieveSemanticMemory(
  userId: string,
  query: string,
  connectionString: string,
  limit: number = 5
): Promise<Array<{ text: string; valence: string }>> {
  const client = new Client({ connectionString });
  await client.connect();
  
  try {
    // Simple text search (in production, use embeddings)
    const result = await client.query(`
      SELECT summary, valence
      FROM user_data_schema.semantic_memory
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);
    
    return result.rows.map(row => ({
      text: row.summary,
      valence: row.valence
    }));
  } finally {
    await client.end();
  }
}

// ===== RAG from MCL =====
async function retrieveMCLContext(
  userId: string,
  connectionString: string,
  limit: number = 3
): Promise<Array<{ summary: string; classification: string }>> {
  const client = new Client({ connectionString });
  await client.connect();
  
  try {
    const result = await client.query(`
      SELECT summary, moral_classification
      FROM user_data_schema.mcl_chains
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);
    
    return result.rows.map(row => ({
      summary: row.summary,
      classification: row.moral_classification
    }));
  } finally {
    await client.end();
  }
}

// ===== Pre-inference Detection =====
function detectHarmfulIntent(message: string): {
  isHarmful: boolean;
  category: string | null;
  score: number;
} {
  let maxScore = 0;
  let maxCategory: string | null = null;
  
  for (const [category, detector] of Object.entries(DETECTORS)) {
    const score = detector.predict(message);
    if (score > maxScore) {
      maxScore = score;
      maxCategory = category;
    }
  }
  
  return {
    isHarmful: maxScore > 0.5,
    category: maxCategory,
    score: maxScore
  };
}

// ===== Post-inference Validation =====
function validateResponse(response: string): {
  isValid: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  
  for (const [category, detector] of Object.entries(DETECTORS)) {
    if (detector.predict(response) > 0.3) {
      violations.push(category);
    }
  }
  
  return {
    isValid: violations.length === 0,
    violations
  };
}

// ===== Main Inference Function =====
export async function generateResponse({
  userId,
  userMessage,
  connectionString,
  ollamaUrl,
  conversationHistory = []
}: {
  userId: string;
  userMessage: string;
  connectionString: string;
  ollamaUrl: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}): Promise<{
  response: string;
  detected: string[];
  usedSafeFallback: boolean;
  mclContext: any[];
}> {
  
  // 1. Pre-inference detection
  const preDetection = detectHarmfulIntent(userMessage);
  
  if (preDetection.isHarmful && preDetection.category) {
    console.log(`🚫 Pre-inference block: ${preDetection.category} (${preDetection.score.toFixed(2)})`);
    
    return {
      response: SAFE_TEMPLATES[preDetection.category as keyof typeof SAFE_TEMPLATES] 
                || 'ขออภัย ฉันไม่สามารถช่วยเหลือในเรื่องนี้ได้',
      detected: [preDetection.category],
      usedSafeFallback: true,
      mclContext: []
    };
  }
  
  // 2. Retrieve context
  console.log('📚 Retrieving context...');
  const [memories, mclContext] = await Promise.all([
    retrieveSemanticMemory(userId, userMessage, connectionString),
    retrieveMCLContext(userId, connectionString)
  ]);
  
  // 3. Build prompt
  const memoryContext = memories.length > 0
    ? `\n\n### Your Previous Context:\n${memories.map(m => `- ${m.text}`).join('\n')}`
    : '';
  
  const mclContextText = mclContext.length > 0
    ? `\n\n### Moral Reasoning Context:\n${mclContext.map(m => `- ${m.summary} (${m.classification})`).join('\n')}`
    : '';
  
  const fullPrompt = `${CONSTITUTIONAL_PROMPT}${memoryContext}${mclContextText}\n\n### User Message:\n${userMessage}`;
  
  // 4. Call Ollama with LoRA
  console.log('🤖 Generating response...');
  const ollamaResponse = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `sunday-ai-${userId}`,
      messages: [
        { role: 'system', content: fullPrompt },
        ...conversationHistory,
        { role: 'user', content: userMessage }
      ],
      options: {
        temperature: 0.7,
        top_p: 0.9
      }
    })
  });
  
  if (!ollamaResponse.ok) {
    throw new Error(`Ollama error: ${ollamaResponse.statusText}`);
  }
  
  const ollamaData = await ollamaResponse.json();
  let response = ollamaData.message?.content || ollamaData.response || '';
  
  // 5. Post-inference validation
  const validation = validateResponse(response);
  
  if (!validation.isValid) {
    console.log(`⚠️  Post-inference violations: ${validation.violations.join(', ')}`);
    
    // Use safe fallback
    const primaryViolation = validation.violations[0];
    response = SAFE_TEMPLATES[primaryViolation as keyof typeof SAFE_TEMPLATES]
              || 'ขออภัย ฉันต้องปรับคำตอบเพื่อความปลอดภัย';
    
    return {
      response,
      detected: validation.violations,
      usedSafeFallback: true,
      mclContext
    };
  }
  
  // 6. Success
  return {
    response,
    detected: [],
    usedSafeFallback: false,
    mclContext
  };
}

// ===== Batch Approval Helper =====
export async function approveForConsolidation(
  connectionString: string,
  userId: string,
  channel: 'good' | 'bad' | 'mcl',
  minScore?: number
): Promise<number> {
  const client = new Client({ connectionString });
  await client.connect();
  
  try {
    let query = '';
    let params: any[] = [userId];
    
    if (channel === 'good') {
      query = `
        UPDATE user_data_schema.stm_good
        SET approved_for_consolidation = TRUE
        WHERE user_id = $1
          AND approved_for_consolidation = FALSE
          ${minScore ? 'AND alignment_score >= $2' : ''}
      `;
      if (minScore) params.push(minScore);
    } else if (channel === 'bad') {
      query = `
        UPDATE user_data_schema.stm_bad
        SET approved_for_shadow_learning = TRUE
        WHERE user_id = $1
          AND approved_for_shadow_learning = FALSE
          AND safe_counterfactual IS NOT NULL
      `;
    } else if (channel === 'mcl') {
      query = `
        UPDATE user_data_schema.mcl_chains
        SET approved_for_training = TRUE
        WHERE user_id = $1
          AND approved_for_training = FALSE
      `;
    }
    
    const result = await client.query(query, params);
    return result.rowCount || 0;
  } finally {
    await client.end();
  }
}