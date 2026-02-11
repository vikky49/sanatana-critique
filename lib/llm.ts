import Groq from 'groq-sdk';

let groq: Groq | null = null;

function getGroqClient(): Groq {
    if (!groq) {
        groq = new Groq({apiKey: process.env.GROQ_API_KEY});
    }
    return groq;
}

async function openAIChatComplete(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    temperature: number,
    maxTokens: number
): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature,
            max_tokens: maxTokens,
        }),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`OpenAI error ${resp.status}: ${text}`);
    }

    const data = await resp.json();
    const result = data.choices?.[0]?.message?.content;
    if (!result) throw new Error('No response from OpenAI');
    return result as string;
}

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
        model = process.env.ANALYSIS_MODEL || 'llama-3.3-70b-versatile',
        temperature = 0.3,
        maxTokens = 2000,
    } = options;

    // Route by model family
    if (model.startsWith('gpt')) {
        return openAIChatComplete(systemPrompt, userPrompt, model, temperature, maxTokens);
    }

    const client = getGroqClient();
    const completion = await client.chat.completions.create({
        model,
        messages: [
            {role: 'system', content: systemPrompt},
            {role: 'user', content: userPrompt},
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

function sanitizeJSON(jsonStr: string): string {
    // Fix invalid escape sequences that LLMs sometimes generate
    // Valid JSON escapes: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
    // Replace invalid \x sequences and other bad escapes
    return jsonStr
        // Replace \x followed by hex digits with unicode escape
        .replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1')
        // Replace standalone backslashes before invalid characters
        .replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
}

export function extractJSON<T>(text: string): T {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('No JSON found in response');
    }

    const sanitized = sanitizeJSON(jsonMatch[0]);
    return JSON.parse(sanitized);
}
