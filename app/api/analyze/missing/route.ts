import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;
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

async function fetchUnanalyzed(
  bookId?: string,
  limit: number = 10
): Promise<VerseRow[]> {
  const db = getPool();
  const where = bookId ? 'WHERE v.book_id = $1 AND v.analyzed = false'
                       : 'WHERE v.analyzed = false';
  const params = bookId ? [bookId, limit] : [limit];
  const sql = `
    SELECT v.id, v.book_id, v.chapter_number, v.verse_number,
           v.original_text, v.translation, v.analyzed, b.title AS book_title
    FROM verses v
    JOIN books b ON v.book_id = b.id
    ${where}
    ORDER BY v.chapter_number, v.verse_number
    LIMIT $${bookId ? 2 : 1}
  `;
  const res = await db.query<VerseRow>(sql, params as any);
  return res.rows;
}

function buildPrompt(v: VerseRow) {
  return `Book: ${v.book_title}\nChapter: ${v.chapter_number}\nVerse: ${v.verse_number}\n\nOriginal Text:\n${v.original_text}\n\nTranslation:\n${v.translation}\n\nAnalyze this verse from a critical 2026 perspective.`;
}

const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL || 'gpt-4.1';

async function analyze(v: VerseRow) {
  const system = loadPrompt('analyze-verse');
  const user = buildPrompt(v);
  const resp = await complete(system, user, { model: ANALYSIS_MODEL, temperature: 0.3, maxTokens: 3000 });
  return extractJSON<AnalysisResult>(resp);
}

export async function POST(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const bookId = sp.get('bookId') ?? undefined;
    const limitStr = sp.get('limit');
    const loopStr = sp.get('loop');
    const concurrencyStr = sp.get('concurrency');

    const limit = Math.min(Math.max(parseInt(limitStr || '10', 10), 1), 25);
    const loop = loopStr === 'true' || loopStr === '1';
    const concurrency = Math.min(Math.max(parseInt(concurrencyStr || '2', 10), 1), 4);

    let analyzed = 0;
    let batches = 0;
    const deadline = Date.now() + 240_000; // ~4 minutes safety budget

    const runBatch = async () => {
      const items = await fetchUnanalyzed(bookId, limit);
      if (items.length === 0) return 0;

      // Simple concurrency control
      let idx = 0;
      const worker = async () => {
        while (idx < items.length) {
          const i = idx++;
          const v = items[i];
          try {
            const a = await analyze(v);
            await insertAnalysis({
              verseId: v.id,
          model: ANALYSIS_MODEL,
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
          } catch (_) {
            // skip failures; continue
          }
        }
      };

      const workers = Array.from({ length: concurrency }, () => worker());
      await Promise.all(workers);
      batches++;
      return items.length;
    };

    // Always run at least one batch
    let processed = await runBatch();

    // If loop requested, keep going while within time budget
    while (loop && processed > 0 && Date.now() < deadline) {
      processed = await runBatch();
    }

    return NextResponse.json({ ok: true, analyzed, batches, looped: loop });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to analyze missing';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
