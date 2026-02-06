import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export async function complete(
  systemPrompt: string,
  userPrompt: string,
  options: CompletionOptions = {}
): Promise<string> {
  const {
    model = 'llama-3.3-70b-versatile',
    temperature = 0.3,
    maxTokens = 8000,
  } = options;

  const completion = await groq.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
  });

  const result = completion.choices[0]?.message?.content;
  if (!result) {
    throw new Error('No response from LLM');
  }

  return result;
}

export function extractJSON<T>(text: string): T {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }
  
  return JSON.parse(jsonMatch[0]);
}
