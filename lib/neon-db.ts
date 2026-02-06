import {neon} from '@neondatabase/serverless';
import type {Database} from './db';
import type {
    Document,
    Book,
    Chapter,
    Verse,
    Analysis,
    ProcessingJob,
    SearchParams,
    SearchResult,
} from '@/types';

let sql: ReturnType<typeof neon> | null = null;

function getSql() {
    if (!sql) {
        sql = neon(process.env.DATABASE_URL!);
    }
    return sql;
}

export class NeonDatabase implements Database {
    async createDocument(doc: Omit<Document, 'id' | 'uploadedAt'>): Promise<Document> {
        const result = await getSql()`
            INSERT INTO documents (filename, title, file_type, size, status, raw_text_url)
            VALUES (${doc.filename}, ${doc.title}, ${doc.fileType}, ${doc.size}, ${doc.status}, ${doc.rawTextUrl}) RETURNING *
        ` as Record<string, unknown>[];

        const row = result[0];
        return {
            id: row.id as string,
            filename: row.filename as string,
            title: row.title as string,
            fileType: row.file_type as string,
            size: row.size as number,
            uploadedAt: new Date(row.uploaded_at as string),
            status: row.status as Document['status'],
            rawTextUrl: row.raw_text_url as string | undefined,
        };
    }

    async getDocument(id: string): Promise<Document | null> {
        const result = await getSql()`
            SELECT *
            FROM documents
            WHERE id = ${id}
        ` as Record<string, unknown>[];

        if (result.length === 0) return null;

        const row = result[0];
        return {
            id: row.id as string,
            filename: row.filename as string,
            title: row.title as string,
            fileType: row.file_type as string,
            size: row.size as number,
            uploadedAt: new Date(row.uploaded_at as string),
            status: row.status as Document['status'],
            rawTextUrl: row.raw_text_url as string | undefined,
        };
    }

    async updateDocumentStatus(id: string, status: Document['status']): Promise<void> {
        await getSql()`
            UPDATE documents
            SET status = ${status}
            WHERE id = ${id}
        `;
    }

    // Placeholder implementations - we'll add these as needed
    async createBook(book: Omit<Book, 'id' | 'createdAt'>): Promise<Book> {
        throw new Error('Not implemented yet');
    }

    async getBook(id: string): Promise<Book | null> {
        throw new Error('Not implemented yet');
    }

    async listBooks(): Promise<Book[]> {
        throw new Error('Not implemented yet');
    }

    async updateBook(id: string, updates: Partial<Book>): Promise<void> {
        throw new Error('Not implemented yet');
    }

    async createChapter(chapter: Omit<Chapter, 'id'>): Promise<Chapter> {
        throw new Error('Not implemented yet');
    }

    async getChaptersByBook(bookId: string): Promise<Chapter[]> {
        throw new Error('Not implemented yet');
    }

    async createVerse(verse: Omit<Verse, 'id'>): Promise<Verse> {
        throw new Error('Not implemented yet');
    }

    async getVerse(id: string): Promise<Verse | null> {
        throw new Error('Not implemented yet');
    }

    async getVersesByChapter(bookId: string, chapterNumber: number): Promise<Verse[]> {
        throw new Error('Not implemented yet');
    }

    async getVersesByBook(bookId: string): Promise<Verse[]> {
        throw new Error('Not implemented yet');
    }

    async updateVerseAnalysisStatus(id: string, analyzed: boolean): Promise<void> {
        throw new Error('Not implemented yet');
    }

    async createAnalysis(analysis: Omit<Analysis, 'id' | 'generatedAt'>): Promise<Analysis> {
        throw new Error('Not implemented yet');
    }

    async getAnalysisByVerse(verseId: string): Promise<Analysis | null> {
        throw new Error('Not implemented yet');
    }

    async getAnalysesByBook(bookId: string): Promise<Analysis[]> {
        throw new Error('Not implemented yet');
    }

    async createJob(job: Omit<ProcessingJob, 'id' | 'startedAt'>): Promise<ProcessingJob> {
        throw new Error('Not implemented yet');
    }

    async getJob(id: string): Promise<ProcessingJob | null> {
        throw new Error('Not implemented yet');
    }

    async updateJob(id: string, updates: Partial<ProcessingJob>): Promise<void> {
        throw new Error('Not implemented yet');
    }

    async listActiveJobs(): Promise<ProcessingJob[]> {
        throw new Error('Not implemented yet');
    }

    async searchVerses(params: SearchParams): Promise<SearchResult[]> {
        throw new Error('Not implemented yet');
    }

    async semanticSearch(embedding: number[], limit: number): Promise<SearchResult[]> {
        throw new Error('Not implemented yet');
    }
}
