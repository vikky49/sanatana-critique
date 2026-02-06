import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { complete, extractJSON } from '@/lib/llm';
import { loadPrompt } from '@/lib/prompts';
import { insertAnalysis, updateVerseAnalyzed } from '@/lib/db-operations';

let sql: ReturnType<typeof neon> | null = null;

function getSql() {
  if (!sql) { sql = neon(process.env.DATABASE_URL!); }
  return sql;
}

interface AnalysisResult {
  modernEthics: string;
  genderAnalysis: string;
  casteAnalysis: string;
  contradictions: string;
  problematicScore: number;
  tags: string[];
  summary: string;
}

// GET - Fetch all verses with their analyses
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const bookId = searchParams.get('bookId');
    const chapterNumber = searchParams.get('chapterNumber');
    const minScore = searchParams.get('minScore');
    const tags = searchParams.get('tags')?.split(',').filter(Boolean);

    // Build dynamic WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];

    if (bookId) {
      conditions.push(`v.book_id = $${params.length + 1}`);
      params.push(bookId);
    }

    if (chapterNumber) {
      conditions.push(`v.chapter_number = $${params.length + 1}`);
      params.push(parseInt(chapterNumber));
    }

    if (minScore) {
      conditions.push(`a.problematic_score >= $${params.length + 1}`);
      params.push(parseInt(minScore));
    }

    if (tags && tags.length > 0) {
      conditions.push(`a.tags && $${params.length + 1}::text[]`);
      params.push(tags);
    }

    const whereClause = conditions.length > 0 
      ? 'AND ' + conditions.join(' AND ')
      : '';

    // Build query with filters using template literal
    let result: any[];
    if (bookId && chapterNumber) {
      result = await getSql()`
        SELECT 
          v.id as verse_id,
          v.book_id,
          v.chapter_number,
          v.verse_number,
          v.original_text,
          v.translation,
          v.analyzed,
          b.title as book_title,
          a.id as analysis_id,
          a.model,
          a.generated_at,
          a.modern_ethics,
          a.gender_analysis,
          a.caste_analysis,
          a.contradictions,
          a.problematic_score,
          a.tags,
          a.summary
        FROM verses v
        JOIN books b ON v.book_id = b.id
        LEFT JOIN analyses a ON v.id = a.verse_id
        WHERE v.book_id = ${bookId} AND v.chapter_number = ${parseInt(chapterNumber)}
        ORDER BY v.book_id, v.chapter_number, v.verse_number
      ` as any[];
    } else if (bookId) {
      result = await getSql()`
        SELECT 
          v.id as verse_id,
          v.book_id,
          v.chapter_number,
          v.verse_number,
          v.original_text,
          v.translation,
          v.analyzed,
          b.title as book_title,
          a.id as analysis_id,
          a.model,
          a.generated_at,
          a.modern_ethics,
          a.gender_analysis,
          a.caste_analysis,
          a.contradictions,
          a.problematic_score,
          a.tags,
          a.summary
        FROM verses v
        JOIN books b ON v.book_id = b.id
        LEFT JOIN analyses a ON v.id = a.verse_id
        WHERE v.book_id = ${bookId}
        ORDER BY v.book_id, v.chapter_number, v.verse_number
      ` as any[];
    } else {
      result = await getSql()`
        SELECT 
          v.id as verse_id,
          v.book_id,
          v.chapter_number,
          v.verse_number,
          v.original_text,
          v.translation,
          v.analyzed,
          b.title as book_title,
          a.id as analysis_id,
          a.model,
          a.generated_at,
          a.modern_ethics,
          a.gender_analysis,
          a.caste_analysis,
          a.contradictions,
          a.problematic_score,
          a.tags,
          a.summary
        FROM verses v
        JOIN books b ON v.book_id = b.id
        LEFT JOIN analyses a ON v.id = a.verse_id
        ORDER BY v.book_id, v.chapter_number, v.verse_number
      ` as any[];
    }

    const verses = result.map((row: any) => ({
      verse: {
        id: row.verse_id,
        bookId: row.book_id,
        bookTitle: row.book_title,
        chapterNumber: row.chapter_number,
        verseNumber: row.verse_number,
        originalText: row.original_text,
        translation: row.translation,
        analyzed: row.analyzed,
      },
      analysis: row.analysis_id ? {
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
      } : null,
    }));

    return NextResponse.json({ verses });

  } catch (error) {
    console.error('Fetch analyses error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch analyses' },
      { status: 500 }
    );
  }
}

// POST - Generate analysis on-demand
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bookId, chapterNumber, verseNumber } = body;

    if (!bookId || chapterNumber === undefined || verseNumber === undefined) {
      return NextResponse.json(
        { error: 'bookId, chapterNumber, and verseNumber are required' },
        { status: 400 }
      );
    }

    // Fetch verse
    const verseResult = await getSql()`
      SELECT v.*, b.title as book_title
      FROM verses v
      JOIN books b ON v.book_id = b.id
      WHERE v.book_id = ${bookId}
        AND v.chapter_number = ${chapterNumber}
        AND v.verse_number = ${verseNumber}
    ` as any[];

    if (verseResult.length === 0) {
      return NextResponse.json(
        { error: 'Verse not found' },
        { status: 404 }
      );
    }

    const verse = verseResult[0];
    const verseId = verse.id;

    // Check if analysis exists
    const existingAnalysis = await getSql()`
      SELECT * FROM analyses
      WHERE verse_id = ${verseId}
      ORDER BY generated_at DESC
      LIMIT 1
    ` as any[];

    if (existingAnalysis.length > 0) {
      const analysis = existingAnalysis[0];
      return NextResponse.json({
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
      });
    }

    // Load prompt and analyze
    const systemPrompt = loadPrompt('analyze-verse');

    const userPrompt = `Book: ${verse.book_title}
Chapter: ${verse.chapter_number}
Verse: ${verse.verse_number}

Original Text:
${verse.original_text}

Translation:
${verse.translation}

Analyze this verse from a critical 2026 perspective.`;

    const response = await complete(systemPrompt, userPrompt, {
      temperature: 0.3,
      maxTokens: 2000,
    });

    const analysisResult: AnalysisResult = extractJSON(response);

    // Store analysis
    const analysis = await insertAnalysis({
      verseId,
      model: 'llama-3.3-70b-versatile',
      modernEthics: analysisResult.modernEthics,
      genderAnalysis: analysisResult.genderAnalysis,
      casteAnalysis: analysisResult.casteAnalysis,
      contradictions: analysisResult.contradictions,
      problematicScore: analysisResult.problematicScore,
      tags: analysisResult.tags,
      summary: analysisResult.summary,
    });

    await updateVerseAnalyzed(verseId);

    return NextResponse.json({
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
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
