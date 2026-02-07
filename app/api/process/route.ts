import {NextRequest, NextResponse} from 'next/server';
import {NeonDatabase} from '@/lib/neon-db';
import {complete, extractJSON} from '@/lib/llm';
import {loadPrompt} from '@/lib/prompts';
import {insertBook, insertChapter, insertVerse} from '@/lib/db-operations';
import {extractTextFromPDF, chunkText, isPDF} from '@/lib/pdf-extractor';
import {createLogger, ProcessingLogger} from '@/lib/processing-logger';

// =============================================================================
// Types
// =============================================================================

interface ParsedVerse {
    number: number;
    originalText: string;
    translation: string;
}

interface ParsedChapter {
    number: number;
    title: string;
    verses: ParsedVerse[];
}

interface ParsedDocument {
    title: string;
    description: string;
    language: string;
    chapters: ParsedChapter[];
}

interface ProcessingContext {
    bookId: string;
    insertedChapters: Set<number>;
    logger: ProcessingLogger;
}

// =============================================================================
// Pure Functions
// =============================================================================

const countVerses = (chapters: ParsedChapter[]): number =>
    chapters.reduce((sum, ch) => sum + ch.verses.length, 0);

const extractMetadata = (docs: ParsedDocument[]): Pick<ParsedDocument, 'title' | 'description' | 'language'> => {
    const first = docs[0];
    return {
        title: first?.title ?? 'Unknown',
        description: first?.description ?? 'No description',
        language: first?.language ?? 'Unknown',
    };
};

const mergeChapters = (chapterLists: ParsedChapter[][]): ParsedChapter[] => {
    const merged = new Map<number, ParsedChapter>();

    chapterLists.flat().forEach(chapter => {
        const existing = merged.get(chapter.number);
        if (existing) {
            existing.verses.push(...chapter.verses);
        } else {
            merged.set(chapter.number, {...chapter, verses: [...chapter.verses]});
        }
    });

    return Array.from(merged.values()).sort((a, b) => a.number - b.number);
};

const combineResults = (docs: (ParsedDocument | null)[]): ParsedDocument => {
    const valid = docs.filter((d): d is ParsedDocument => d !== null);
    return {
        ...extractMetadata(valid),
        chapters: mergeChapters(valid.map(d => d.chapters)),
    };
};

const buildPrompt = (text: string, chunkIndex?: number, totalChunks?: number): string =>
    chunkIndex !== undefined && totalChunks !== undefined
        ? `Parse this religious text (part ${chunkIndex + 1} of ${totalChunks}):\n\n${text}\n\nReturn chapters and verses found in this section.`
        : `Parse this religious text:\n\n${text}`;

const isDuplicateError = (error: unknown): boolean => {
    const msg = error instanceof Error ? error.message : '';
    return msg.includes('duplicate') || msg.includes('unique');
};

// =============================================================================
// Database Operations
// =============================================================================

const db = new NeonDatabase();

const createBook = async (documentId: string, logger: ProcessingLogger) => {
    await logger.info('Creating book record');
    const book = await insertBook({
        documentId,
        title: 'Processing...',
        description: 'Document is being processed',
        language: 'Unknown',
        totalChapters: 0,
        totalVerses: 0,
    });
    await logger.info(`Book created: ${book.id}`);
    return book;
};

const updateBook = async (bookId: string, doc: ParsedDocument, logger: ProcessingLogger) => {
    const totalVerses = countVerses(doc.chapters);
    await logger.info(`Finalizing book: "${doc.title}"`, {
        chapters: doc.chapters.length,
        verses: totalVerses,
    });
    await db.updateBook(bookId, {
        title: doc.title,
        description: doc.description,
        language: doc.language,
        totalChapters: doc.chapters.length,
        totalVerses,
    });
};

const storeChapter = async (chapter: ParsedChapter, ctx: ProcessingContext) => {
    if (ctx.insertedChapters.has(chapter.number)) return;

    await insertChapter({
        bookId: ctx.bookId,
        number: chapter.number,
        title: chapter.title,
        verseCount: chapter.verses.length,
    });
    ctx.insertedChapters.add(chapter.number);
    await ctx.logger.info(`Stored Chapter ${chapter.number}: ${chapter.title}`);
};

const storeVerse = async (verse: ParsedVerse, chapterNum: number, ctx: ProcessingContext) => {
    try {
        await insertVerse({
            bookId: ctx.bookId,
            chapterNumber: chapterNum,
            verseNumber: verse.number,
            originalText: verse.originalText,
            translation: verse.translation,
        });
    } catch (error) {
        if (!isDuplicateError(error)) {
            await ctx.logger.error(`Failed to insert verse ${chapterNum}:${verse.number}`);
        }
    }
};

const storeChunkData = async (doc: ParsedDocument, ctx: ProcessingContext) => {
    for (const chapter of doc.chapters) {
        await storeChapter(chapter, ctx);
        for (const verse of chapter.verses) {
            await storeVerse(verse, chapter.number, ctx);
        }
    }
};

// =============================================================================
// Document Extraction
// =============================================================================

const fetchDocumentBuffer = async (url: string): Promise<Buffer> => {
    // Handle both blob URLs and legacy base64 data URLs
    if (url.startsWith('data:')) {
        const base64Data = url.split(',')[1];
        return Buffer.from(base64Data, 'base64');
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch document: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
};

const extractDocumentText = async (documentId: string, logger: ProcessingLogger): Promise<string> => {
    const document = await db.getDocument(documentId);
    if (!document?.rawTextUrl) throw new Error('Document not found');

    await logger.info(`Fetching document: ${document.fileType}`);
    const buffer = await fetchDocumentBuffer(document.rawTextUrl);
    await logger.info(`Document size: ${(buffer.length / 1024).toFixed(1)} KB`);

    if (isPDF(document.fileType)) {
        await logger.info('Extracting text from PDF...');
        const text = await extractTextFromPDF(buffer);
        await logger.info(`Extracted ${text.length} characters`);
        return text;
    }

    return buffer.toString('utf-8');
};

// =============================================================================
// LLM Parsing
// =============================================================================

const MAX_CHUNK_SIZE = 25000;
const MODEL = 'llama-3.3-70b-versatile';

const parseWithLLM = async (
    text: string,
    systemPrompt: string,
    logger: ProcessingLogger,
    chunkIndex?: number,
    totalChunks?: number
): Promise<ParsedDocument | null> => {
    const userPrompt = buildPrompt(text, chunkIndex, totalChunks);
    const startTime = Date.now();

    try {
        await logger.llmRequest(MODEL, userPrompt.length, {maxTokens: 16000});
        const response = await complete(systemPrompt, userPrompt, {maxTokens: 16000});
        await logger.llmResponse(MODEL, response.length, Date.now() - startTime);

        const parsed = extractJSON<ParsedDocument>(response);
        await logger.parseResult(parsed.chapters.length, countVerses(parsed.chapters));
        return parsed;
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        const chunkInfo = chunkIndex !== undefined ? ` chunk ${chunkIndex + 1}` : '';
        await logger.error(`Parse failed${chunkInfo}: ${msg}`);
        return null;
    }
};

const parseChunks = async (
    chunks: { text: string }[],
    systemPrompt: string,
    ctx: ProcessingContext
): Promise<ParsedDocument[]> => {
    const results: ParsedDocument[] = [];

    for (let i = 0; i < chunks.length; i++) {
        await ctx.logger.chunkProcessing(i, chunks.length, chunks[i].text.length);

        const parsed = await parseWithLLM(
            chunks[i].text,
            systemPrompt,
            ctx.logger,
            i,
            chunks.length
        );

        if (parsed) {
            await storeChunkData(parsed, ctx);
            results.push(parsed);
        }
    }

    return results;
};

const parseDocument = async (text: string, ctx: ProcessingContext): Promise<ParsedDocument> => {
    const systemPrompt = loadPrompt('parse-document');

    if (text.length <= MAX_CHUNK_SIZE) {
        await ctx.logger.info('Single chunk document');
        const result = await parseWithLLM(text, systemPrompt, ctx.logger);
        if (result) await storeChunkData(result, ctx);
        return result ?? {title: 'Unknown', description: '', language: 'Unknown', chapters: []};
    }

    const chunks = chunkText(text, MAX_CHUNK_SIZE);
    await ctx.logger.info(`Splitting into ${chunks.length} chunks`, {
        textLength: text.length,
        chunkCount: chunks.length,
    });

    const results = await parseChunks(chunks, systemPrompt, ctx);
    const combined = combineResults(results);

    await ctx.logger.info(`Parsing complete: ${combined.chapters.length} chapters, ${countVerses(combined.chapters)} verses`);
    return combined;
};

// =============================================================================
// API Handler
// =============================================================================

export async function POST(request: NextRequest) {
    let logger: ProcessingLogger | null = null;

    try {
        const {documentId} = await request.json();
        if (!documentId) {
            return NextResponse.json({message: 'Document ID required'}, {status: 400});
        }

        logger = createLogger(documentId);
        await logger.info('Starting processing');

        const book = await createBook(documentId, logger);
        const ctx: ProcessingContext = {
            bookId: book.id,
            insertedChapters: new Set(),
            logger,
        };

        const text = await extractDocumentText(documentId, logger);
        const parsed = await parseDocument(text, ctx);
        await updateBook(book.id, parsed, logger);

        await logger.info('Processing complete', {
            bookId: book.id,
            title: parsed.title,
            chapters: parsed.chapters.length,
            verses: countVerses(parsed.chapters),
        });

        return NextResponse.json({
            success: true,
            book: {
                id: book.id,
                title: parsed.title,
                totalChapters: parsed.chapters.length,
                totalVerses: countVerses(parsed.chapters),
            },
            documentId,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (logger) await logger.error(`Processing failed: ${message}`);
        return NextResponse.json({message: 'Processing failed', error: message}, {status: 500});
    }
}
