import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export interface CompletionPayload {
  prompt: string;
  userId: string;
}

export async function executeResilientCompletion({ prompt, userId }: CompletionPayload) {
  const cacheKey = `cache:llm:${Buffer.from(prompt).toString('base64').slice(0, 32)}`;

  try {
    const cachedResponse = await redis.get<string>(cacheKey);
    if (cachedResponse) {
      return { data: cachedResponse, source: 'cache', latencyMs: 4 };
    }
  } catch (err) {
    console.warn('Redis Cache Miss / Read Error:', err);
  }

  const startTime = Date.now();

  try {
    const response = await callPrimaryProvider(prompt);
    await redis.set(cacheKey, response, { ex: 86400 });
    return { data: response, source: 'primary', latencyMs: Date.now() - startTime };
  } catch (primaryError) {
    console.error('Primary Provider Failed. Switching to Secondary Fallback...', primaryError);

    try {
      const fallbackResponse = await callSecondaryProvider(prompt);
      return { data: fallbackResponse, source: 'fallback', latencyMs: Date.now() - startTime };
    } catch (fallbackError) {
      throw new Error('All LLM providers failed to fulfill request.');
    }
  }
}

async function callPrimaryProvider(prompt: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
  
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) throw new Error(`OpenAI API error status ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callSecondaryProvider(prompt: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY');
  
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) throw new Error(`Anthropic API error status ${res.status}`);
  const data = await res.json();
  return data.content[0].text;
}