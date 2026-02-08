import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { loadQuery } from '@/lib/sql-loader';

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  return pool;
}

interface Row {
  id: string;
  book_id: string;
  chapter_number: number;
  verse_number: number;
  original_text: string;
  translation: string;
  analyzed: boolean;
  book_title: string;
  analysis_id: string;
  model: string;
  generated_at: string;
  modern_ethics: string | null;
  gender_analysis: string | null;
  caste_analysis: string | null;
  contradictions: string | null;
  problematic_score: number;
  tags: string[] | null;
  summary: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const minScore = Number(sp.get('minScore') ?? '70');
    const limit = Math.min(Number(sp.get('limit') ?? '20'), 100);
    const bookId = sp.get('bookId');
    const tagsParam = sp.get('tags');
    const tags = tagsParam ? tagsParam.split(',').map(t => t.trim()).filter(Boolean) : [];

    const query = loadQuery('fetch-top-bad-verses');
    const db = getPool();
    const result = await db.query<Row>(query, [minScore, bookId ?? null, tags.length ? tags : null, limit]);

    const items = result.rows.map(r => ({
      verse: {
        id: r.id,
        bookId: r.book_id,
        bookTitle: r.book_title,
        chapterNumber: r.chapter_number,
        verseNumber: r.verse_number,
        originalText: r.original_text,
        translation: r.translation,
        analyzed: r.analyzed,
      },
      analysis: {
        id: r.analysis_id,
        model: r.model,
        generatedAt: r.generated_at,
        modernEthics: r.modern_ethics || undefined,
        genderAnalysis: r.gender_analysis || undefined,
        casteAnalysis: r.caste_analysis || undefined,
        contradictions: r.contradictions || undefined,
        problematicScore: r.problematic_score,
        tags: r.tags || [],
        summary: r.summary || '',
      }
    }));

    return NextResponse.json({ items, minScore, limit, bookId, tags });
  } catch (error) {
    console.error('Highlights API error:', error);
    const message = error instanceof Error ? error.message : 'Failed to load highlights';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
