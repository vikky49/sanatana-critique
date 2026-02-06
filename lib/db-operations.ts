import {neon} from '@neondatabase/serverless';
import type {Book, Chapter, Verse} from '@/types';

let sql: ReturnType<typeof neon> | null = null;

function getSql() {
    if (!sql) {
        sql = neon(process.env.DATABASE_URL!);
    }
    return sql;
}

interface BookInput {
    documentId: string;
    title: string;
    description: string;
    language: string;
    totalChapters: number;
    totalVerses: number;
}

interface ChapterInput {
    bookId: string;
    number: number;
    title: string;
    verseCount: number;
}

interface VerseInput {
    bookId: string;
    chapterNumber: number;
    verseNumber: number;
    originalText: string;
    translation: string;
}

interface BookRow {
    id: string;
    document_id: string;
    title: string;
    description: string;
    language: string;
    total_chapters: number;
    total_verses: number;
    created_at: string;
    processed_at: string | null;
}

interface ChapterRow {
    id: string;
    book_id: string;
    number: number;
    title: string;
    verse_count: number;
}

interface VerseRow {
    id: string;
    book_id: string;
    chapter_number: number;
    verse_number: number;
    original_text: string;
    translation: string;
    analyzed: boolean;
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

export async function insertBook(data: BookInput): Promise<Book> {
    const result = await getSql()`
        INSERT INTO books (document_id, title, description, language,
                           total_chapters, total_verses, processed_at)
        VALUES (${data.documentId}, ${data.title}, ${data.description}, ${data.language},
                ${data.totalChapters}, ${data.totalVerses}, NOW()) RETURNING *
    ` as BookRow[];

    const row = result[0];
    return {
        id: row.id,
        documentId: row.document_id,
        title: row.title,
        description: row.description,
        language: row.language,
        totalChapters: row.total_chapters,
        totalVerses: row.total_verses,
        createdAt: new Date(row.created_at),
        processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
    };
}

export async function insertChapter(data: ChapterInput): Promise<Chapter> {
    const result = await getSql()`
        INSERT INTO chapters (book_id, number, title, verse_count)
        VALUES (${data.bookId}, ${data.number}, ${data.title}, ${data.verseCount}) RETURNING *
    ` as ChapterRow[];

    const row = result[0];
    return {
        id: row.id,
        bookId: row.book_id,
        number: row.number,
        title: row.title,
        verseCount: row.verse_count,
    };
}

export async function insertVerse(data: VerseInput): Promise<Verse> {
    const result = await getSql()`
        INSERT INTO verses (book_id, chapter_number, verse_number,
                            original_text, translation)
        VALUES (${data.bookId}, ${data.chapterNumber}, ${data.verseNumber},
                ${data.originalText}, ${data.translation}) RETURNING *
    ` as VerseRow[];

    const row = result[0];
    return {
        id: row.id,
        bookId: row.book_id,
        chapterNumber: row.chapter_number,
        verseNumber: row.verse_number,
        originalText: row.original_text,
        translation: row.translation,
        analyzed: row.analyzed || false,
    };
}

interface AnalysisInput {
    verseId: string;
    model: string;
    modernEthics: string;
    genderAnalysis: string;
    casteAnalysis: string;
    contradictions: string;
    problematicScore: number;
    tags: string[];
    summary: string;
}

export async function insertAnalysis(data: AnalysisInput) {
    const result = await getSql()`
        INSERT INTO analyses (verse_id, model, generated_at,
                              modern_ethics, gender_analysis, caste_analysis,
                              contradictions, problematic_score, tags, summary)
        VALUES (${data.verseId}, ${data.model}, NOW(),
                ${data.modernEthics}, ${data.genderAnalysis},
                ${data.casteAnalysis}, ${data.contradictions},
                ${data.problematicScore}, ${JSON.stringify(data.tags)},
                ${data.summary}) RETURNING *
    ` as AnalysisRow[];

    return result[0];
}

export async function updateVerseAnalyzed(verseId: string) {
    await getSql()`
        UPDATE verses
        SET analyzed = true
        WHERE id = ${verseId}
    `;
}
