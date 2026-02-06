import type {
  LLMModel,
  ParsedDocument,
  Verse,
  Analysis,
  AnalysisConfig,
} from '@/types';

/**
 * AI Service for interacting with LLM APIs
 * Handles parsing, analysis, and embedding generation
 */

export class AIService {
  private apiKey: string;
  private baseUrl: string;

  constructor(model: LLMModel) {
    // Determine which API to use based on model
    if (model.startsWith('gpt')) {
      this.apiKey = process.env.OPENAI_API_KEY || '';
      this.baseUrl = 'https://api.openai.com/v1';
    } else {
      this.apiKey = process.env.ANTHROPIC_API_KEY || '';
      this.baseUrl = 'https://api.anthropic.com/v1';
    }
  }

  /**
   * Parse raw document text into structured format using LLM
   */
  async parseDocument(
    rawText: string,
    customInstructions?: string
  ): Promise<ParsedDocument> {
    const systemPrompt = `You are an expert at parsing ancient religious texts and scriptures.
Your task is to extract and structure the content into a hierarchical format.

IMPORTANT: Return ONLY valid JSON, no markdown code blocks or additional text.

Expected JSON structure:
{
  "title": "Book title",
  "description": "Brief description of the text",
  "language": "Primary language (e.g., Sanskrit, Pali)",
  "era": "Historical period if identifiable",
  "author": "Author/composer if known",
  "structure": [
    {
      "number": 1,
      "title": "Chapter/Section title",
      "description": "Brief description",
      "verses": [
        {
          "number": 1,
          "originalText": "Text in original language",
          "transliteration": "Romanized version if applicable",
          "translation": "English translation",
          "speaker": "Who is speaking (if dialogue)",
          "context": "Contextual information"
        }
      ]
    }
  ],
  "confidence": 0.95
}

${customInstructions || 'Automatically infer the structure from the text.'}`;

    const response = await this.callLLM(systemPrompt, rawText, 'gpt-4o');
    
    try {
      return JSON.parse(response);
    } catch (e) {
      throw new Error(`Failed to parse LLM response: ${response}`);
    }
  }

  /**
   * Analyze a single verse from critical perspectives
   */
  async analyzeVerse(
    verse: Verse,
    config: AnalysisConfig
  ): Promise<Omit<Analysis, 'id' | 'verseId' | 'generatedAt'>> {
    const perspectivePrompts = this.buildPerspectivePrompts(config.perspectives);
    
    const systemPrompt = `You are a critical scholar analyzing ancient religious texts from a modern, progressive perspective.
Your analysis should be:
- Factual and evidence-based
- Critical but not dismissive
- Focused on problematic elements from modern ethical standards
- Aware of historical context while emphasizing current incompatibility

IMPORTANT: Return ONLY valid JSON, no markdown code blocks.

Analyze the verse through these lenses:
${perspectivePrompts}

Return JSON in this format:
{
  "modernEthics": "Analysis of ethical issues by modern standards",
  "genderAnalysis": "Analysis of gender representations, roles, restrictions",
  "casteAnalysis": "Analysis of caste/class hierarchies and discrimination",
  "contradictions": "Logical contradictions or conflicts with other teachings",
  "historicalContext": "Historical context vs modern applicability",
  "problematicScore": 0-10,
  "tags": ["misogyny", "casteism", "violence", etc],
  "summary": "Concise critical summary",
  "citations": ["references to related verses if relevant"]
}

${config.customInstructions || ''}`;

    const userPrompt = `Book: ${verse.bookId}
Chapter ${verse.chapterNumber}, Verse ${verse.verseNumber}

Original Text: ${verse.originalText}
${verse.transliteration ? `Transliteration: ${verse.transliteration}` : ''}
Translation: ${verse.translation}
${verse.speaker ? `Speaker: ${verse.speaker}` : ''}
${verse.context ? `Context: ${verse.context}` : ''}`;

    const response = await this.callLLM(systemPrompt, userPrompt, config.model);
    
    try {
      const parsed = JSON.parse(response);
      return {
        model: config.model,
        ...parsed,
      };
    } catch (e) {
      throw new Error(`Failed to parse analysis response: ${response}`);
    }
  }

  /**
   * Batch analyze multiple verses with progress tracking
   */
  async analyzeBatch(
    verses: Verse[],
    config: AnalysisConfig,
    onProgress?: (processed: number, total: number) => void
  ): Promise<Analysis[]> {
    const results: Analysis[] = [];
    const { batchSize } = config;

    for (let i = 0; i < verses.length; i += batchSize) {
      const batch = verses.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (verse) => {
        const analysis = await this.analyzeVerse(verse, config);
        return {
          id: crypto.randomUUID(),
          verseId: verse.id,
          generatedAt: new Date(),
          ...analysis,
        };
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      if (onProgress) {
        onProgress(results.length, verses.length);
      }

      // Rate limiting - small delay between batches
      if (i + batchSize < verses.length) {
        await this.delay(1000);
      }
    }

    return results;
  }

  /**
   * Generate embedding vector for semantic search
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-3-small',
      }),
    });

    const data = await response.json();
    return data.data[0].embedding;
  }

  /**
   * Generate book-level summary from analyses
   */
  async summarizeBook(
    bookTitle: string,
    analyses: Analysis[]
  ): Promise<string> {
    const topIssues = this.aggregateIssues(analyses);
    const avgScore = analyses.reduce((sum, a) => sum + a.problematicScore, 0) / analyses.length;

    const systemPrompt = `You are a critical scholar providing high-level summaries of problematic elements in ancient religious texts.
Focus on patterns, recurring themes, and overall assessment from a modern ethical perspective.`;

    const userPrompt = `Summarize the critical analysis of: ${bookTitle}

Statistics:
- Total verses analyzed: ${analyses.length}
- Average problematic score: ${avgScore.toFixed(1)}/10
- Highly problematic verses (score > 7): ${analyses.filter(a => a.problematicScore > 7).length}

Top recurring issues:
${topIssues}

Provide a comprehensive 2-3 paragraph summary of the main problems with this text from a 2026 perspective.`;

    return await this.callLLM(systemPrompt, userPrompt, 'gpt-4o-mini');
  }

  /**
   * Private: Make LLM API call
   */
  private async callLLM(
    systemPrompt: string,
    userPrompt: string,
    model: LLMModel
  ): Promise<string> {
    if (model.startsWith('gpt')) {
      return this.callOpenAI(systemPrompt, userPrompt, model);
    } else {
      return this.callAnthropic(systemPrompt, userPrompt, model);
    }
  }

  private async callOpenAI(
    systemPrompt: string,
    userPrompt: string,
    model: string
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    return data.choices[0].message.content;
  }

  private async callAnthropic(
    systemPrompt: string,
    userPrompt: string,
    model: string
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    return data.content[0].text;
  }

  /**
   * Helper: Build perspective-specific prompts
   */
  private buildPerspectivePrompts(perspectives: string[]): string {
    if (perspectives.includes('all')) {
      return '- All perspectives (modern ethics, gender, caste, contradictions, historical context)';
    }
    return perspectives.map(p => `- ${p.replace('_', ' ')}`).join('\n');
  }

  /**
   * Helper: Aggregate common issues across analyses
   */
  private aggregateIssues(analyses: Analysis[]): string {
    const tagCounts: Record<string, number> = {};
    
    analyses.forEach(a => {
      a.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => `- ${tag}: ${count} verses`)
      .join('\n');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
