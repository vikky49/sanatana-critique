import {NextRequest, NextResponse} from 'next/server';
import {neon} from '@neondatabase/serverless';

interface DocumentRow {
    id: string;
    filename: string;
    file_type: string;
    size: number;
    status: string;
    uploaded_at: string;
}

interface BookRow {
    id: string;
    title: string;
    description: string;
    language: string;
    total_chapters: number;
    total_verses: number;
}

interface ChapterRow {
    number: number;
    title: string;
    verse_count: number;
}

interface AnalysisCountRow {
    total: number;
    completed: number;
}

let sql: ReturnType<typeof neon> | null = null;

function getSql() {
    if (!sql) {
        sql = neon(process.env.DATABASE_URL!);
    }
    return sql;
}

interface ProcessingStatusResponse {
    documentId: string;
    status: 'uploaded' | 'processing' | 'completed' | 'failed';
    document: {
        filename: string;
        fileType: string;
        size: number;
        uploadedAt: string;
    } | null;
    book: {
        id: string;
        title: string;
        description: string;
        language: string;
        totalChapters: number;
        totalVerses: number;
    } | null;
    chapters: Array<{
        number: number;
        title: string;
        verseCount: number;
    }>;
    analyses: {
        total: number;
        completed: number;
    };
    error?: string;
}

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ documentId: string }> }
): Promise<NextResponse<ProcessingStatusResponse>> {
    const {documentId} = await context.params;
    
    try {

        // Fetch document
        const docResult = await getSql()`
            SELECT id, filename, file_type, size, status, uploaded_at
            FROM documents
            WHERE id = ${documentId}
        ` as DocumentRow[];

        if (docResult.length === 0) {
            return NextResponse.json({
                documentId,
                status: 'failed',
                document: null,
                book: null,
                chapters: [],
                analyses: {total: 0, completed: 0},
                error: 'Document not found',
            }, {status: 404});
        }

        const doc = docResult[0];

        // Fetch book if exists
        const bookResult = await getSql()`
            SELECT id, title, description, language, total_chapters, total_verses
            FROM books
            WHERE document_id = ${documentId}
        ` as BookRow[];

        const book: BookRow | null = bookResult.length > 0 ? bookResult[0] : null;

        // Fetch chapters if book exists
        let chapters: ProcessingStatusResponse['chapters'] = [];
        if (book) {
            const chapterResult = await getSql()`
                SELECT number, title, verse_count
                FROM chapters
                WHERE book_id = ${book.id}
                ORDER BY number
            ` as ChapterRow[];

            chapters = chapterResult.map((ch: ChapterRow) => ({
                number: ch.number,
                title: ch.title,
                verseCount: ch.verse_count,
            }));
        }

        // Fetch analysis counts if book exists
        let analyses = {total: 0, completed: 0};
        if (book) {
            const analysisResult = await getSql()`
                SELECT COUNT(*)::int as total, COUNT(CASE WHEN analyzed = true THEN 1 END) ::int as completed
                FROM verses
                WHERE book_id = ${book.id}
            ` as AnalysisCountRow[];

            if (analysisResult.length > 0) {
                analyses = {
                    total: analysisResult[0].total,
                    completed: analysisResult[0].completed,
                };
            }
        }

        // Determine overall status
        let status: ProcessingStatusResponse['status'] = 'uploaded';
        if (doc.status === 'failed') {
            status = 'failed';
        } else if (book) {
            status = 'completed';
        } else if (doc.status === 'processing' || doc.status === 'parsing') {
            status = 'processing';
        }

        return NextResponse.json({
            documentId,
            status,
            document: {
                filename: doc.filename,
                fileType: doc.file_type,
                size: doc.size,
                uploadedAt: doc.uploaded_at,
            },
            book: book ? {
                id: book.id,
                title: book.title,
                description: book.description,
                language: book.language,
                totalChapters: book.total_chapters,
                totalVerses: book.total_verses,
            } : null,
            chapters,
            analyses,
        });

    } catch (error) {
        console.error('Status check error:', error);
        return NextResponse.json({
            documentId,
            status: 'failed',
            document: null,
            book: null,
            chapters: [],
            analyses: {total: 0, completed: 0},
            error: error instanceof Error ? error.message : 'Failed to check status',
        }, {status: 500});
    }
}
