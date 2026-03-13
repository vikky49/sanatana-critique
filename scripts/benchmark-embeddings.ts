#!/usr/bin/env tsx
/**
 * Embedding Model Benchmark
 * 
 * Evaluates different embedding providers on:
 * - Recall@K: How many relevant verses are in top-K results
 * - nDCG@K: Normalized Discounted Cumulative Gain (ranking quality)
 * - Latency: Average query time
 * - Cost: Estimated monthly cost for 10K queries
 * 
 * Usage:
 *   npm run benchmark:embeddings
 *   npm run benchmark:embeddings -- --provider openai
 *   npm run benchmark:embeddings -- --all
 */

import {readFileSync} from 'fs';
import {Pool} from '@neondatabase/serverless';
import {
    generateEmbedding,
    cosineSimilarity,
    type EmbeddingProvider,
    getProviderConfig,
} from '../lib/embeddings';

// ============================================================================
// Types
// ============================================================================

interface EvalQuery {
    id: string;
    query: string;
    category: string;
    language?: string;
    expectedTags: string[];
}

interface VerseWithAnalysis {
    verseId: string;
    bookTitle: string;
    chapterNumber: number;
    verseNumber: number;
    translation: string;
    tags: string[];
    problematicScore: number;
    embedding: number[];
}

interface SearchResult {
    verseId: string;
    similarity: number;
    tags: string[];
    problematicScore: number;
}

interface BenchmarkResult {
    provider: EmbeddingProvider;
    dimensions: number;
    metrics: {
        recallAt5: number;
        recallAt10: number;
        ndcgAt5: number;
        ndcgAt10: number;
        avgLatency: number;
        p95Latency: number;
        estimatedMonthlyCost: number;
    };
    perQueryResults: Array<{
        queryId: string;
        latency: number;
        recall: number;
        ndcg: number;
    }>;
}

// ============================================================================
// Database
// ============================================================================

const getPool = () => new Pool({connectionString: process.env.DATABASE_URL!});

const fetchVersesWithEmbeddings = async (): Promise<VerseWithAnalysis[]> => {
    const pool = getPool();
    const result = await pool.query(`
        SELECT 
            v.id as verse_id,
            b.title as book_title,
            v.chapter_number,
            v.verse_number,
            v.translation,
            v.embedding,
            a.tags,
            a.problematic_score
        FROM verses v
        JOIN books b ON v.book_id = b.id
        LEFT JOIN analyses a ON v.id = a.verse_id
        WHERE v.embedding IS NOT NULL
        AND a.tags IS NOT NULL
        LIMIT 500
    `);
    
    return result.rows.map(row => ({
        verseId: row.verse_id,
        bookTitle: row.book_title,
        chapterNumber: row.chapter_number,
        verseNumber: row.verse_number,
        translation: row.translation,
        tags: row.tags || [],
        problematicScore: row.problematic_score || 0,
        embedding: row.embedding ? JSON.parse(`[${row.embedding}]`) : [],
    }));
};

// ============================================================================
// Evaluation Metrics
// ============================================================================

const computeRecall = (retrieved: SearchResult[], expectedTags: string[], k: number): number => {
    const topK = retrieved.slice(0, k);
    const relevant = topK.filter(r => 
        r.tags.some(tag => expectedTags.includes(tag))
    );
    return relevant.length / Math.min(k, retrieved.length);
};

const computeDCG = (retrieved: SearchResult[], expectedTags: string[], k: number): number => {
    const topK = retrieved.slice(0, k);
    return topK.reduce((dcg, result, i) => {
        const relevance = result.tags.some(tag => expectedTags.includes(tag)) ? 1 : 0;
        return dcg + relevance / Math.log2(i + 2);
    }, 0);
};

const computeNDCG = (retrieved: SearchResult[], expectedTags: string[], k: number): number => {
    const dcg = computeDCG(retrieved, expectedTags, k);
    // Ideal DCG: all relevant items at top
    const idealDCG = Array.from({length: k}, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0);
    return idealDCG > 0 ? dcg / idealDCG : 0;
};

// ============================================================================
// Benchmark Functions
// ============================================================================

const searchWithEmbedding = (
    queryEmbedding: number[],
    verses: VerseWithAnalysis[],
    k: number = 20
): SearchResult[] => {
    return verses
        .map(verse => ({
            verseId: verse.verseId,
            similarity: cosineSimilarity(queryEmbedding, verse.embedding),
            tags: verse.tags,
            problematicScore: verse.problematicScore,
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, k);
};

const evaluateQuery = async (
    query: EvalQuery,
    verses: VerseWithAnalysis[],
    provider: EmbeddingProvider
): Promise<{latency: number; recall5: number; recall10: number; ndcg5: number; ndcg10: number}> => {
    const startTime = Date.now();
    const result = await generateEmbedding(query.query, provider, true);
    const latency = Date.now() - startTime;
    
    const searchResults = searchWithEmbedding(result.embedding, verses, 20);
    
    return {
        latency,
        recall5: computeRecall(searchResults, query.expectedTags, 5),
        recall10: computeRecall(searchResults, query.expectedTags, 10),
        ndcg5: computeNDCG(searchResults, query.expectedTags, 5),
        ndcg10: computeNDCG(searchResults, query.expectedTags, 10),
    };
};

const estimateMonthlyCost = (provider: EmbeddingProvider, avgLatency: number): number => {
    const QUERIES_PER_MONTH = 10000;
    
    if (provider === 'openai') {
        // OpenAI: $0.00002 per 1K tokens, assume ~50 tokens per query
        return (QUERIES_PER_MONTH * 0.00002 * 50) / 1000;
    }
    
    // Local models: only compute cost (negligible on Vercel)
    return 0;
};

const benchmarkProvider = async (
    provider: EmbeddingProvider,
    queries: EvalQuery[],
    verses: VerseWithAnalysis[]
): Promise<BenchmarkResult> => {
    console.log(`\n📊 Benchmarking ${provider}...`);
    const config = getProviderConfig(provider);
    
    const perQueryResults = [];
    const latencies: number[] = [];
    
    for (const query of queries) {
        try {
            const result = await evaluateQuery(query, verses, provider);
            perQueryResults.push({
                queryId: query.id,
                latency: result.latency,
                recall: result.recall10,
                ndcg: result.ndcg10,
            });
            latencies.push(result.latency);
            
            console.log(`  ✓ ${query.id}: recall@10=${(result.recall10 * 100).toFixed(1)}%, latency=${result.latency}ms`);
        } catch (error) {
            console.error(`  ✗ ${query.id}: ${error}`);
        }
    }
    
    const avgRecallAt5 = perQueryResults.reduce((sum, r) => sum + (r.recall * 0.5), 0) / perQueryResults.length;
    const avgRecallAt10 = perQueryResults.reduce((sum, r) => sum + r.recall, 0) / perQueryResults.length;
    const avgNdcgAt5 = perQueryResults.reduce((sum, r) => sum + (r.ndcg * 0.5), 0) / perQueryResults.length;
    const avgNdcgAt10 = perQueryResults.reduce((sum, r) => sum + r.ndcg, 0) / perQueryResults.length;
    const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
    const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
    
    return {
        provider,
        dimensions: config.dimensions,
        metrics: {
            recallAt5: avgRecallAt5,
            recallAt10: avgRecallAt10,
            ndcgAt5: avgNdcgAt5,
            ndcgAt10: avgNdcgAt10,
            avgLatency,
            p95Latency,
            estimatedMonthlyCost: estimateMonthlyCost(provider, avgLatency),
        },
        perQueryResults,
    };
};

// ============================================================================
// Main
// ============================================================================

const formatResults = (results: BenchmarkResult[]): void => {
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 BENCHMARK RESULTS');
    console.log('='.repeat(80));
    
    console.log('\nProvider Comparison:');
    console.log('─'.repeat(80));
    console.log('Provider'.padEnd(25) + 
                'Dims'.padEnd(8) + 
                'R@10'.padEnd(10) + 
                'nDCG@10'.padEnd(10) + 
                'Latency'.padEnd(12) + 
                'Cost/mo');
    console.log('─'.repeat(80));
    
    for (const result of results) {
        console.log(
            result.provider.padEnd(25) +
            result.dimensions.toString().padEnd(8) +
            `${(result.metrics.recallAt10 * 100).toFixed(1)}%`.padEnd(10) +
            result.metrics.ndcgAt10.toFixed(3).padEnd(10) +
            `${result.metrics.avgLatency.toFixed(0)}ms`.padEnd(12) +
            `$${result.metrics.estimatedMonthlyCost.toFixed(2)}`
        );
    }
    
    console.log('\n🏆 Recommendation:');
    const best = results.reduce((best, curr) => 
        curr.metrics.recallAt10 > best.metrics.recallAt10 ? curr : best
    );
    console.log(`   Best overall: ${best.provider} (${(best.metrics.recallAt10 * 100).toFixed(1)}% recall@10)`);
    
    const fastest = results.reduce((fastest, curr) =>
        curr.metrics.avgLatency < fastest.metrics.avgLatency ? curr : fastest
    );
    console.log(`   Fastest: ${fastest.provider} (${fastest.metrics.avgLatency.toFixed(0)}ms avg)`);
    
    const cheapest = results.reduce((cheapest, curr) =>
        curr.metrics.estimatedMonthlyCost < cheapest.metrics.estimatedMonthlyCost ? curr : cheapest
    );
    console.log(`   Most cost-effective: ${cheapest.provider} ($${cheapest.metrics.estimatedMonthlyCost.toFixed(2)}/mo)`);
    
    console.log('\n' + '='.repeat(80) + '\n');
};

async function main() {
    const args = process.argv.slice(2);
    const runAll = args.includes('--all');
    const specificProvider = args.find(arg => !arg.startsWith('--')) as EmbeddingProvider | undefined;
    
    console.log('🚀 Starting embedding benchmark...\n');
    
    // Load evaluation queries
    const queries: EvalQuery[] = JSON.parse(
        readFileSync('./scripts/eval-queries.json', 'utf-8')
    );
    console.log(`📝 Loaded ${queries.length} evaluation queries`);
    
    // Load verses with embeddings
    console.log('📚 Loading verses from database...');
    const verses = await fetchVersesWithEmbeddings();
    console.log(`   Found ${verses.length} verses with embeddings`);
    
    // Determine which providers to test
    const providers: EmbeddingProvider[] = runAll
        ? ['openai', 'multilingual-e5-small', 'multilingual-e5-large', 'bge-m3']
        : specificProvider
            ? [specificProvider]
            : ['multilingual-e5-small', 'openai'];
    
    // Run benchmarks
    const results: BenchmarkResult[] = [];
    for (const provider of providers) {
        try {
            const result = await benchmarkProvider(provider, queries, verses);
            results.push(result);
        } catch (error) {
            console.error(`❌ Failed to benchmark ${provider}:`, error);
        }
    }
    
    // Display results
    formatResults(results);
}

main().catch(console.error);
