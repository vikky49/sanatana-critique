import {NextRequest, NextResponse} from 'next/server';
import {neon} from '@neondatabase/serverless';
import {getLogsForDocument} from '@/lib/processing-logger';

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

const getSql = (() => {
    let sql: ReturnType<typeof neon> | null = null;
    return () => sql ?? (sql = neon(process.env.DATABASE_URL!));
})();

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
    logs: Array<{
        id: string;
        level: string;
        message: string;
        metadata?: Record<string, unknown>;
        createdAt: string;
    }>;
    error?: string;
}

// =============================================================================
// Data Fetching
// =============================================================================

const fetchDocument = async (documentId: string): Promise<DocumentRow | null> => {
    const result = await getSql()`
        SELECT id, filename, file_type, size, status, uploaded_at
        FROM documents
        WHERE id = ${documentId}
    ` as DocumentRow[];
    return result[0] ?? null;
};

const fetchBook = async (documentId: string): Promise<BookRow | null> => {
    const result = await getSql()`
        SELECT id, title, description, language, total_chapters, total_verses
        FROM books
        WHERE document_id = ${documentId}
    ` as BookRow[];
    return result[0] ?? null;
};

const fetchChapters = async (bookId: string): Promise<ChapterRow[]> => {
    return await getSql()`
        SELECT number, title, verse_count
        FROM chapters
        WHERE book_id = ${bookId}
        ORDER BY number
    ` as ChapterRow[];
};

const fetchAnalysisCounts = async (bookId: string): Promise<AnalysisCountRow> => {
    const result = await getSql()`
        SELECT COUNT(*)::int as total, COUNT(CASE WHEN analyzed = true THEN 1 END) ::int as completed
        FROM verses
        WHERE book_id = ${bookId}
    ` as AnalysisCountRow[];
    return result[0] ?? {total: 0, completed: 0};
};

// =============================================================================
// Transformers
// =============================================================================

const toDocumentResponse = (doc: DocumentRow) => ({
    filename: doc.filename,
    fileType: doc.file_type,
    size: doc.size,
    uploadedAt: doc.uploaded_at,
});

const toBookResponse = (book: BookRow) => ({
    id: book.id,
    title: book.title,
    description: book.description,
    language: book.language,
    totalChapters: book.total_chapters,
    totalVerses: book.total_verses,
});

const toChapterResponse = (ch: ChapterRow) => ({
    number: ch.number,
    title: ch.title,
    verseCount: ch.verse_count,
});

const toLogResponse = (log: Awaited<ReturnType<typeof getLogsForDocument>>[number]) => ({
    id: log.id,
    level: log.level,
    message: log.message,
    metadata: log.metadata,
    createdAt: log.createdAt.toISOString(),
});

const determineStatus = (
    docStatus: string,
    hasBook: boolean
): ProcessingStatusResponse['status'] => {
    if (docStatus === 'failed') return 'failed';
    if (hasBook) return 'completed';
    if (docStatus === 'processing' || docStatus === 'parsing') return 'processing';
    return 'uploaded';
};

const createErrorResponse = (
    documentId: string,
    error: string,
    statusCode: number
): NextResponse<ProcessingStatusResponse> =>
    NextResponse.json({
        documentId,
        status: 'failed',
        document: null,
        book: null,
        chapters: [],
        analyses: {total: 0, completed: 0},
        logs: [],
        error,
    }, {status: statusCode});

// =============================================================================
// Route Handler
// =============================================================================

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ documentId: string }> }
): Promise<NextResponse<ProcessingStatusResponse>> {
    const {documentId} = await context.params;

    try {
        const doc = await fetchDocument(documentId);
        if (!doc) {
            return createErrorResponse(documentId, 'Document not found', 404);
        }

        const [book, logs] = await Promise.all([
            fetchBook(documentId),
            getLogsForDocument(documentId),
        ]);

        const [chapters, analyses] = book
            ? await Promise.all([
                fetchChapters(book.id),
                fetchAnalysisCounts(book.id),
            ])
            : [[], {total: 0, completed: 0}];

        return NextResponse.json({
            documentId,
            status: determineStatus(doc.status, !!book),
            document: toDocumentResponse(doc),
            book: book ? toBookResponse(book) : null,
            chapters: chapters.map(toChapterResponse),
            analyses,
            logs: logs.map(toLogResponse),
        });
    } catch (error) {
        console.error('Status check error:', error);
        const message = error instanceof Error ? error.message : 'Failed to check status';
        return createErrorResponse(documentId, message, 500);
    }
}
