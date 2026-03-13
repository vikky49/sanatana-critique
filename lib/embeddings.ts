/**
 * Flexible Embedding Provider System
 * 
 * Supports multiple embedding models for evaluation and production use:
 * - OpenAI text-embedding-3-small (1536 dims, API)
 * - multilingual-e5-large (1024 dims, local)
 * - bge-m3 (1024 dims, local)
 * - LaBSE (768 dims, local)
 */

import {pipeline, env} from '@xenova/transformers';

// Configure transformers.js
env.allowLocalModels = false;
env.allowRemoteModels = true;

// ============================================================================
// Types
// ============================================================================

export type EmbeddingProvider = 
    | 'openai'
    | 'multilingual-e5-small'
    | 'multilingual-e5-large'
    | 'bge-m3'
    | 'labse';

export interface EmbeddingConfig {
    provider: EmbeddingProvider;
    dimensions: number;
    modelName: string;
    prefixQuery?: string;
    prefixPassage?: string;
}

export interface EmbeddingResult {
    embedding: number[];
    dimensions: number;
    provider: EmbeddingProvider;
    latencyMs: number;
}

// ============================================================================
// Provider Configurations
// ============================================================================

const PROVIDER_CONFIGS: Record<EmbeddingProvider, EmbeddingConfig> = {
    'openai': {
        provider: 'openai',
        dimensions: 1536,
        modelName: 'text-embedding-3-small',
    },
    'multilingual-e5-small': {
        provider: 'multilingual-e5-small',
        dimensions: 384,
        modelName: 'Xenova/multilingual-e5-small',
        prefixQuery: 'query: ',
        prefixPassage: 'passage: ',
    },
    'multilingual-e5-large': {
        provider: 'multilingual-e5-large',
        dimensions: 1024,
        modelName: 'Xenova/multilingual-e5-large',
        prefixQuery: 'query: ',
        prefixPassage: 'passage: ',
    },
    'bge-m3': {
        provider: 'bge-m3',
        dimensions: 1024,
        modelName: 'Xenova/bge-m3',
    },
    'labse': {
        provider: 'labse',
        dimensions: 768,
        modelName: 'Xenova/LaBSE',
    },
};

// ============================================================================
// Model Cache
// ============================================================================

const modelCache = new Map<string, any>();

const getTransformersModel = async (modelName: string): Promise<any> => {
    if (!modelCache.has(modelName)) {
        const model = await pipeline('feature-extraction', modelName, {quantized: true});
        modelCache.set(modelName, model);
    }
    return modelCache.get(modelName)!;
};

// ============================================================================
// Provider Implementations
// ============================================================================

const generateOpenAIEmbedding = async (text: string, config: EmbeddingConfig): Promise<number[]> => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');
    
    const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            input: text,
            model: config.modelName,
        }),
    });
    
    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.data[0].embedding;
};

const generateLocalEmbedding = async (
    text: string,
    config: EmbeddingConfig,
    isQuery: boolean = false
): Promise<number[]> => {
    const model = await getTransformersModel(config.modelName);
    const prefix = isQuery ? (config.prefixQuery ?? '') : (config.prefixPassage ?? '');
    const prefixedText = `${prefix}${text}`;
    
    const output = await model(prefixedText, {
        pooling: 'mean',
        normalize: true,
    });
    
    return Array.from(output.data);
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate embedding using specified provider
 */
export const generateEmbedding = async (
    text: string,
    provider: EmbeddingProvider = getDefaultProvider(),
    isQuery: boolean = false
): Promise<EmbeddingResult> => {
    const startTime = Date.now();
    const config = PROVIDER_CONFIGS[provider];
    
    const embedding = provider === 'openai'
        ? await generateOpenAIEmbedding(text, config)
        : await generateLocalEmbedding(text, config, isQuery);
    
    return {
        embedding,
        dimensions: config.dimensions,
        provider,
        latencyMs: Date.now() - startTime,
    };
};

/**
 * Generate embeddings in batch (more efficient for local models)
 */
export const generateEmbeddingsBatch = async (
    texts: string[],
    provider: EmbeddingProvider = getDefaultProvider(),
    isQuery: boolean = false
): Promise<EmbeddingResult[]> => {
    if (provider === 'openai') {
        // OpenAI doesn't have good batch support, do sequential
        return Promise.all(texts.map(text => generateEmbedding(text, provider, isQuery)));
    }
    
    const startTime = Date.now();
    const config = PROVIDER_CONFIGS[provider];
    const model = await getTransformersModel(config.modelName);
    const prefix = isQuery ? (config.prefixQuery ?? '') : (config.prefixPassage ?? '');
    
    const outputs = await Promise.all(
        texts.map(text =>
            model(`${prefix}${text}`, {
                pooling: 'mean',
                normalize: true,
            })
        )
    );
    
    const totalLatency = Date.now() - startTime;
    const avgLatency = totalLatency / texts.length;
    
    return outputs.map(output => ({
        embedding: Array.from(output.data),
        dimensions: config.dimensions,
        provider,
        latencyMs: avgLatency,
    }));
};

/**
 * Get provider configuration
 */
export const getProviderConfig = (provider: EmbeddingProvider): EmbeddingConfig => {
    return PROVIDER_CONFIGS[provider];
};

/**
 * Get default provider from environment or fallback
 */
export const getDefaultProvider = (): EmbeddingProvider => {
    const envProvider = process.env.EMBEDDING_PROVIDER as EmbeddingProvider;
    return envProvider && PROVIDER_CONFIGS[envProvider] ? envProvider : 'multilingual-e5-small';
};

/**
 * Get current embedding dimension (for database schema)
 */
export const getEmbeddingDimension = (provider?: EmbeddingProvider): number => {
    const p = provider ?? getDefaultProvider();
    return PROVIDER_CONFIGS[p].dimensions;
};

// ============================================================================
// Utilities
// ============================================================================

/**
 * Compute cosine similarity between two vectors
 */
export const cosineSimilarity = (a: number[], b: number[]): number => {
    if (a.length !== b.length) throw new Error('Vector dimension mismatch');
    
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    
    return dotProduct / (magA * magB);
};

/**
 * Validate embedding dimensions
 */
export const validateEmbedding = (embedding: number[], expectedDim: number): boolean => {
    return embedding.length === expectedDim;
};
