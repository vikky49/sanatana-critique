import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { complete, extractJSON } from '@/lib/llm';
import { loadPrompt } from '@/lib/prompts';
import { insertAnalysis, updateVerseAnalyzed } from '@/lib/db-operations';

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

interface AnalysisResult {
  modernEthics: string;
  genderAnalysis: string;
  casteAnalysis: string;
  contradictions: string;
  problematicScore: number;
  tags: string[];
  summary: string;
}

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  return pool;
}

async function fetchUnanalyzed(bookId?: string): Promise<VerseRow[]> {
  const db = getPool();
  const where = bookId ? 'WHERE v.book_id = $1 AND v.analyzed = false'
                       : 'WHERE v.analyzed = false';
  const params = bookId ? [bookId] : [];
  const sql = `
    SELECT v.id, v.book_id, v.chapter_number, v.verse_number,
           v.original_text, v.translation, v.analyzed, b.title AS book_title
    FROM verses v
    JOIN books b ON v.book_id = b.id
    ${where}
    ORDER BY v.chapter_number, v.verse_number
    LIMIT 200
  `;
  const res = await db.query<VerseRow>(sql, params as any);
  return res.rows;
}

function buildPrompt(v: VerseRow) {
  return `Book: ${v.book_title}\nChapter: ${v.chapter_number}\nVerse: ${v.verse_number}\n\nOriginal Text:\n${v.original_text}\n\nTranslation:\n${v.translation}\n\nAnalyze this verse from a critical 2026 perspective.`;
}

async function analyze(v: VerseRow) {
  const system = loadPrompt('analyze-verse');
  const user = buildPrompt(v);
  const resp = await complete(system, user, { temperature: 0.3, maxTokens: 2000 });
  return extractJSON<AnalysisResult>(resp);
}

export async function POST(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const bookId = sp.get('bookId') ?? undefined;

    const items = await fetchUnanalyzed(bookId);
    if (items.length === 0) {
      return NextResponse.json({ ok: true, analyzed: 0 });
    }

    let analyzed = 0;
    for (const v of items) {
      try {
        const a = await analyze(v);
        await insertAnalysis({
          verseId: v.id,
          model: 'llama-3.3-70b-versatile',
          modernEthics: a.modernEthics,
          genderAnalysis: a.genderAnalysis,
          casteAnalysis: a.casteAnalysis,
          contradictions: a.contradictions,
          problematicScore: a.problematicScore,
          tags: a.tags,
          summary: a.summary,
        });
        await updateVerseAnalyzed(v.id);
        analyzed++;
      } catch (e) {
        // continue with next verse
      }
    }

    return NextResponse.json({ ok: true, analyzed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to analyze missing';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}