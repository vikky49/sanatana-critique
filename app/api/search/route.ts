import {NextRequest, NextResponse} from 'next/server';
import {Pool} from '@neondatabase/serverless';
import {generateEmbedding, getDefaultProvider} from '@/lib/embeddings';

// ============================================================================
// Types
// ============================================================================

interface SearchResult {
    verse: {
        id: string;
        bookId: string;
        bookTitle: string;
        chapterNumber: number;
        verseNumber: number;
        originalText: string;
        translation: string;
    };
    analysis: {
        id: string;
        modernEthics: string | null;
        genderAnalysis: string | null;
        casteAnalysis: string | null;
        contradictions: string | null;
        scientificAccuracy: string | null;
        logicalConsistency: string | null;
        powerDynamics: string | null;
        culturalContext: string | null;
        problematicScore: number;
        tags: string[];
        summary: string;
        confidence: number | null;
    } | null;
    relevance: number;
}

interface SearchParams {
    query: string;
    bookIds?: string[];
    minScore: number;
    maxScore: number;
    tags?: string[];
    perspectives?: string[];
    limit: number;
    sortBy: 'relevance' | 'score' | 'chapter';
    useSemanticSearch: boolean;
}

interface QueryBuilder {
    conditions: string[];
    values: any[];
    counter: number;
}

// ============================================================================
// Database
// ============================================================================

let pool: Pool | null = null;

const getPool = (): Pool => {
    pool = pool ?? new Pool({connectionString: process.env.DATABASE_URL!});
    return pool;
};

// ============================================================================
// Functional Helpers
// ============================================================================


const perspectiveToColumn = (perspective: string): string | null => {
    const mapping: Record<string, string> = {
        'modern_ethics': 'a.modern_ethics IS NOT NULL',
        'gender': 'a.gender_analysis IS NOT NULL',
        'caste': 'a.caste_analysis IS NOT NULL',
        'contradictions': 'a.contradictions IS NOT NULL',
        'scientific': 'a.scientific_accuracy IS NOT NULL',
        'logical': 'a.logical_consistency IS NOT NULL',
        'power': 'a.power_dynamics IS NOT NULL',
        'cultural': 'a.cultural_context IS NOT NULL',
    };
    return mapping[perspective] ?? null;
};

// Query builder using functional composition
const addCondition = (builder: QueryBuilder, condition: string, value?: any): QueryBuilder => {
    if (value === undefined) {
        return {...builder, conditions: [...builder.conditions, condition]};
    }
    return {
        conditions: [...builder.conditions, condition],
        values: [...builder.values, value],
        counter: builder.counter + 1,
    };
};

const addScoreFilter = (builder: QueryBuilder, minScore: number, maxScore: number): QueryBuilder => 
    addCondition(
        addCondition(builder, `a.problematic_score >= $${builder.counter}`, minScore),
        `a.problematic_score <= $${builder.counter}`,
        maxScore
    );

const addBookFilter = (builder: QueryBuilder, bookIds?: string[]): QueryBuilder =>
    bookIds?.length 
        ? addCondition(builder, `v.book_id = ANY($${builder.counter})`, bookIds)
        : builder;

const addTagFilter = (builder: QueryBuilder, tags?: string[]): QueryBuilder =>
    tags?.length
        ? addCondition(builder, `a.tags && $${builder.counter}::text[]`, tags)
        : builder;

const addPerspectiveFilter = (builder: QueryBuilder, perspectives?: string[]): QueryBuilder => {
    if (!perspectives?.length) return builder;
    
    const conditions = perspectives
        .map(perspectiveToColumn)
        .filter((c): c is string => c !== null);
    
    return conditions.length
        ? addCondition(builder, `(${conditions.join(' OR ')})`)
        : builder;
};

const buildWhereClause = (params: SearchParams): QueryBuilder => {
    const initial: QueryBuilder = {conditions: [], values: [], counter: 1};
    
    return [
        (b: QueryBuilder) => addScoreFilter(b, params.minScore, params.maxScore),
        (b: QueryBuilder) => addBookFilter(b, params.bookIds),
        (b: QueryBuilder) => addTagFilter(b, params.tags),
        (b: QueryBuilder) => addPerspectiveFilter(b, params.perspectives),
    ].reduce((builder, fn) => fn(builder), initial);
};

const buildSemanticSelect = (builder: QueryBuilder, embedding: number[]): {select: string; builder: QueryBuilder} => ({
    select: `1 - (v.embedding <=> $${builder.counter}::vector) as relevance`,
    builder: addCondition(
        addCondition(builder, 'v.embedding IS NOT NULL'),
        `$${builder.counter}`,
        `[${embedding.join(',')}]`
    ),
});

const buildKeywordSelect = (): {select: string} => ({
    select: '0 as relevance',
});

const buildOrderBy = (sortBy: SearchParams['sortBy'], hasSemanticSearch: boolean): string => {
    const orders: Record<string, string> = {
        'relevance': hasSemanticSearch ? 'ORDER BY relevance DESC' : 'ORDER BY v.chapter_number, v.verse_number',
        'score': hasSemanticSearch ? 'ORDER BY a.problematic_score DESC, relevance DESC' : 'ORDER BY a.problematic_score DESC',
        'chapter': 'ORDER BY v.chapter_number, v.verse_number',
    };
    return orders[sortBy] ?? orders.chapter;
};

const buildSearchQuery = (params: SearchParams, queryEmbedding?: number[]): {query: string; values: any[]} => {
    const whereBuilder = buildWhereClause(params);
    
    const {select, builder: selectBuilder} = params.useSemanticSearch && queryEmbedding
        ? buildSemanticSelect(whereBuilder, queryEmbedding)
        : {...buildKeywordSelect(), builder: whereBuilder};
    
    const orderBy = buildOrderBy(params.sortBy, params.useSemanticSearch && !!queryEmbedding);
    const limitBuilder = addCondition(selectBuilder, `$${selectBuilder.counter}`, params.limit);
    
    const query = `
        SELECT 
            v.id as verse_id,
            v.book_id,
            b.title as book_title,
            v.chapter_number,
            v.verse_number,
            v.original_text,
            v.translation,
            a.id as analysis_id,
            a.modern_ethics,
            a.gender_analysis,
            a.caste_analysis,
            a.contradictions,
            a.scientific_accuracy,
            a.logical_consistency,
            a.power_dynamics,
            a.cultural_context,
            a.problematic_score,
            a.tags,
            a.summary,
            a.confidence,
            ${select}
        FROM verses v
        JOIN books b ON v.book_id = b.id
        LEFT JOIN analyses a ON v.id = a.verse_id
        WHERE ${selectBuilder.conditions.join(' AND ')}
        ${orderBy}
        LIMIT $${selectBuilder.counter}
    `;
    
    return {query, values: limitBuilder.values};
};

const formatSearchResult = (row: any): SearchResult => ({
    verse: {
        id: row.verse_id,
        bookId: row.book_id,
        bookTitle: row.book_title,
        chapterNumber: row.chapter_number,
        verseNumber: row.verse_number,
        originalText: row.original_text,
        translation: row.translation,
    },
    analysis: row.analysis_id ? {
        id: row.analysis_id,
        modernEthics: row.modern_ethics,
        genderAnalysis: row.gender_analysis,
        casteAnalysis: row.caste_analysis,
        contradictions: row.contradictions,
        scientificAccuracy: row.scientific_accuracy,
        logicalConsistency: row.logical_consistency,
        powerDynamics: row.power_dynamics,
        culturalContext: row.cultural_context,
        problematicScore: row.problematic_score,
        tags: row.tags || [],
        summary: row.summary,
        confidence: row.confidence,
    } : null,
    relevance: parseFloat(row.relevance) || 0,
});

// ============================================================================
// Parameter Parsing
// ============================================================================

const parseSearchParams = (searchParams: URLSearchParams): SearchParams => ({
    query: searchParams.get('query') || '',
    bookIds: searchParams.get('bookIds')?.split(',').filter(Boolean),
    minScore: parseInt(searchParams.get('minScore') || '0', 10),
    maxScore: parseInt(searchParams.get('maxScore') || '10', 10),
    tags: searchParams.get('tags')?.split(',').filter(Boolean),
    perspectives: searchParams.get('perspectives')?.split(',').filter(Boolean),
    limit: parseInt(searchParams.get('limit') || '50', 10),
    sortBy: (searchParams.get('sortBy') || 'relevance') as 'relevance' | 'score' | 'chapter',
    useSemanticSearch: searchParams.get('useSemanticSearch') !== 'false',
});

const tryGenerateEmbedding = async (query: string, useSemanticSearch: boolean): Promise<number[] | undefined> => {
    if (!useSemanticSearch || !query.trim()) return undefined;
    
    try {
        const provider = getDefaultProvider();
        const result = await generateEmbedding(query, provider, true);
        return result.embedding;
    } catch (error) {
        console.error('Failed to generate embedding:', error);
        return undefined;
    }
};

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: NextRequest) {
    try {
        const params = parseSearchParams(request.nextUrl.searchParams);
        const queryEmbedding = await tryGenerateEmbedding(params.query, params.useSemanticSearch);
        
        const {query: sql, values} = buildSearchQuery(params, queryEmbedding);
        const result = await getPool().query(sql, values);
        const results = result.rows.map(formatSearchResult);

        return NextResponse.json({
            results,
            count: results.length,
            query: params.query,
            filters: {
                bookIds: params.bookIds,
                minScore: params.minScore,
                maxScore: params.maxScore,
                tags: params.tags,
                perspectives: params.perspectives,
            },
        });

    } catch (error) {
        console.error('Search error:', error);
        const message = error instanceof Error ? error.message : 'Search failed';
        return NextResponse.json({error: message}, {status: 500});
    }
}
