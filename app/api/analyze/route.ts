import {NextRequest, NextResponse} from 'next/server';
import {Pool} from '@neondatabase/serverless';
import {complete, extractJSON} from '@/lib/llm';
import {loadPrompt} from '@/lib/prompts';
import {loadQuery} from '@/lib/sql-loader';
import {insertAnalysis, updateVerseAnalyzed} from '@/lib/db-operations';

// ============================================================================
// Types
// ============================================================================

interface AnalysisResult {
    modernEthics: string;
    genderAnalysis: string;
    casteAnalysis: string;
    contradictions: string;
    problematicScore: number;
    tags: string[];
    summary: string;
}

interface VerseRow {
    id: string;
    book_id: string;
    chapter_number: number;
    verse_number: number;
    original_text: string;
    translation: string;
    analyzed: boolean;
    book_title: string;
}

interface AnalysisRow {
    id: string;
    verse_id: string;
    model: string;
    generated_at: string;
    modern_ethics: string;
    gender_analysis: string;
    caste_analysis: string;
    contradictions: string;
    problematic_score: number;
    tags: string[];
    summary: string;
}

interface VerseWithAnalysisRow extends VerseRow {
    analysis_id: string | null;
    model: string | null;
    generated_at: string | null;
    modern_ethics: string | null;
    gender_analysis: string | null;
    caste_analysis: string | null;
    contradictions: string | null;
    problematic_score: number | null;
    tags: string[] | null;
    summary: string | null;
}

interface QueryParams {
    bookId?: string;
    chapterNumber?: number;
}

interface AnalyzeRequestBody {
    bookId: string;
    chapterNumber: number;
    verseNumber: number;
}

// ============================================================================
// Database
// ============================================================================

let pool: Pool | null = null;

function getPool(): Pool {
    if (!pool) {
        pool = new Pool({connectionString: process.env.DATABASE_URL!});
    }
    return pool;
}

// ============================================================================
// Response Formatters
// ============================================================================

function formatAnalysisResponse(analysis: AnalysisRow) {
    return {
        id: analysis.id,
        verseId: analysis.verse_id,
        model: analysis.model,
        generatedAt: analysis.generated_at,
        modernEthics: analysis.modern_ethics,
        genderAnalysis: analysis.gender_analysis,
        casteAnalysis: analysis.caste_analysis,
        contradictions: analysis.contradictions,
        problematicScore: analysis.problematic_score,
        tags: analysis.tags,
        summary: analysis.summary,
    };
}

function formatVerseWithAnalysis(row: VerseWithAnalysisRow) {
    return {
        verse: {
            id: row.id,
            bookId: row.book_id,
            bookTitle: row.book_title,
            chapterNumber: row.chapter_number,
            verseNumber: row.verse_number,
            originalText: row.original_text,
            translation: row.translation,
            analyzed: row.analyzed,
        },
        analysis: row.analysis_id
            ? {
                id: row.analysis_id,
                model: row.model,
                generatedAt: row.generated_at,
                modernEthics: row.modern_ethics,
                genderAnalysis: row.gender_analysis,
                casteAnalysis: row.caste_analysis,
                contradictions: row.contradictions,
                problematicScore: row.problematic_score,
                tags: row.tags,
                summary: row.summary,
            }
            : null,
    };
}

function errorResponse(message: string, status: number) {
    return NextResponse.json({error: message}, {status});
}

// ============================================================================
// Query Builders
// ============================================================================

async function fetchVersesWithAnalyses(params: QueryParams): Promise<VerseWithAnalysisRow[]> {
    const db = getPool();
    const {bookId, chapterNumber} = params;

    if (bookId && chapterNumber !== undefined) {
        const query = loadQuery('fetch-verses-with-analyses-by-book-chapter');
        const result = await db.query(query, [bookId, chapterNumber]);
        return result.rows as VerseWithAnalysisRow[];
    }

    if (bookId) {
        const query = loadQuery('fetch-verses-with-analyses-by-book');
        const result = await db.query(query, [bookId]);
        return result.rows as VerseWithAnalysisRow[];
    }

    const query = loadQuery('fetch-verses-with-analyses');
    const result = await db.query(query);
    return result.rows as VerseWithAnalysisRow[];
}

async function fetchVerse(bookId: string, chapterNumber: number, verseNumber: number): Promise<VerseRow | null> {
    const db = getPool();
    const query = loadQuery('fetch-verse-by-location');
    const result = await db.query(query, [bookId, chapterNumber, verseNumber]);

    return result.rows[0] as VerseRow ?? null;
}

async function fetchLatestAnalysis(verseId: string): Promise<AnalysisRow | null> {
    const db = getPool();
    const query = loadQuery('fetch-analysis-by-verse');
    const result = await db.query(query, [verseId]);

    return result.rows[0] as AnalysisRow ?? null;
}

// ============================================================================
// LLM Analysis
// ============================================================================

function buildAnalysisPrompt(verse: VerseRow): string {
    return `Book: ${verse.book_title}
Chapter: ${verse.chapter_number}
Verse: ${verse.verse_number}

Original Text:
${verse.original_text}

Translation:
${verse.translation}

Analyze this verse from a critical 2026 perspective.`;
}

async function generateAnalysis(verse: VerseRow): Promise<AnalysisResult> {
    const systemPrompt = loadPrompt('analyze-verse');
    const userPrompt = buildAnalysisPrompt(verse);

    const response = await complete(systemPrompt, userPrompt, {
        temperature: 0.3,
        maxTokens: 2000,
    });

    return extractJSON(response);
}

// ============================================================================
// Route Handlers
// ============================================================================

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const bookId = searchParams.get('bookId') ?? undefined;
        const chapterNumberStr = searchParams.get('chapterNumber');
        const chapterNumber = chapterNumberStr ? parseInt(chapterNumberStr, 10) : undefined;

        const rows = await fetchVersesWithAnalyses({bookId, chapterNumber});
        const verses = rows.map(formatVerseWithAnalysis);

        return NextResponse.json({verses});
    } catch (error) {
        console.error('Fetch analyses error:', error);
        const message = error instanceof Error ? error.message : 'Failed to fetch analyses';
        return errorResponse(message, 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const body: Partial<AnalyzeRequestBody> = await request.json();
        const {bookId, chapterNumber, verseNumber} = body;

        if (!bookId || chapterNumber === undefined || verseNumber === undefined) {
            return errorResponse('bookId, chapterNumber, and verseNumber are required', 400);
        }

        const verse = await fetchVerse(bookId, chapterNumber, verseNumber);
        if (!verse) {
            return errorResponse('Verse not found', 404);
        }

        const existingAnalysis = await fetchLatestAnalysis(verse.id);
        if (existingAnalysis) {
            return NextResponse.json(formatAnalysisResponse(existingAnalysis));
        }

        const analysisResult = await generateAnalysis(verse);

        const analysis = await insertAnalysis({
            verseId: verse.id,
            model: 'llama-3.3-70b-versatile',
            modernEthics: analysisResult.modernEthics,
            genderAnalysis: analysisResult.genderAnalysis,
            casteAnalysis: analysisResult.casteAnalysis,
            contradictions: analysisResult.contradictions,
            problematicScore: analysisResult.problematicScore,
            tags: analysisResult.tags,
            summary: analysisResult.summary,
        });

        await updateVerseAnalyzed(verse.id);

        return NextResponse.json(formatAnalysisResponse(analysis as AnalysisRow));
    } catch (error) {
        console.error('Analysis error:', error);
        const message = error instanceof Error ? error.message : 'Analysis failed';
        return errorResponse(message, 500);
    }
}
