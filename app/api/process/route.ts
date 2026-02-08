import {NextRequest, NextResponse} from 'next/server';
import {NeonDatabase} from '@/lib/neon-db';
import {complete, extractJSON} from '@/lib/llm';
import {loadPrompt} from '@/lib/prompts';
import {insertBook, insertChapter, insertVerse, insertAnalysis, updateVerseAnalyzed, getVersesByBookId} from '@/lib/db-operations';
import {extractTextFromPDF, chunkText, isPDF} from '@/lib/pdf-extractor';
import {createLogger, ProcessingLogger} from '@/lib/processing-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

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

const fetchDocumentBuffer = async (url: string, logger: ProcessingLogger): Promise<Buffer> => {
    // Handle legacy base64 data URLs
    if (url.startsWith('data:')) {
        await logger.info('Document stored as base64 data URL (legacy)');
        const base64Data = url.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        await logger.debug(`Base64 decoded: ${buffer.length} bytes`);
        return buffer;
    }

    // Fetch from Vercel Blob URL
    const isVercelBlob = url.includes('blob.vercel-storage.com') || url.includes('public.blob.vercel-storage.com');
    await logger.info(`Fetching from ${isVercelBlob ? 'Vercel Blob' : 'external URL'}`, { 
        urlPrefix: url.substring(0, 80),
        fullUrl: url,
        isVercelBlob,
    });

    try {
        const response = await fetch(url, {
            headers: {
                'Accept': '*/*',
            },
        });

        await logger.info(`Fetch response: ${response.status} ${response.statusText}`, {
            status: response.status,
            contentType: response.headers.get('content-type'),
            contentLength: response.headers.get('content-length'),
            headers: Object.fromEntries(response.headers.entries()),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unable to read error body');
            throw new Error(`Failed to fetch document: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        await logger.info(`Blob data received`, {
            byteLength: arrayBuffer.byteLength,
            sizeKB: (arrayBuffer.byteLength / 1024).toFixed(2),
            sizeMB: (arrayBuffer.byteLength / 1024 / 1024).toFixed(2),
        });
        
        return Buffer.from(arrayBuffer);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown fetch error';
        await logger.error(`Fetch failed: ${msg}`);
        throw error;
    }
};

const extractDocumentText = async (documentId: string, logger: ProcessingLogger): Promise<string> => {
    const document = await db.getDocument(documentId);
    if (!document?.rawTextUrl) throw new Error('Document not found');

    await logger.info(`Starting document extraction: ${document.fileType}`, { 
        documentId,
        fileType: document.fileType,
        urlLength: document.rawTextUrl.length,
    });
    
    const fetchStart = Date.now();
    const buffer = await fetchDocumentBuffer(document.rawTextUrl, logger);
    await logger.info(`Document fetched: ${(buffer.length / 1024).toFixed(1)} KB`, {
        sizeKB: (buffer.length / 1024).toFixed(1),
        fetchTimeMs: Date.now() - fetchStart,
    });

    if (isPDF(document.fileType)) {
        await logger.info('Starting PDF text extraction...');
        const text = await extractTextFromPDF(buffer, async (progress) => {
            await logger.info(`PDF ${progress.stage}: ${progress.message}`, progress.details);
        });
        await logger.info(`PDF extraction complete: ${text.length} characters`);
        return text;
    }

    await logger.info('Processing as plain text');
    return buffer.toString('utf-8');
};

// =============================================================================
// LLM Parsing & Analysis
// =============================================================================

const MAX_CHUNK_SIZE = 25000;
const MODEL = 'llama-3.3-70b-versatile';
const ANALYSIS_CONCURRENCY = Number(process.env.ANALYSIS_CONCURRENCY || 2);

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
        await logger.llmRequest(MODEL, userPrompt.length, {
            maxTokens: 16000,
            chunkIndex,
            totalChunks,
            textPreview: text.substring(0, 500),
            textLength: text.length,
        });
        await logger.debug(`LLM Input - System prompt length: ${systemPrompt.length}`, {
            systemPromptPreview: systemPrompt.substring(0, 300),
        });
        await logger.debug(`LLM Input - User prompt preview`, {
            userPromptPreview: userPrompt.substring(0, 1000),
            userPromptLength: userPrompt.length,
        });
        
        const response = await complete(systemPrompt, userPrompt, {maxTokens: 16000});
        
        await logger.llmResponse(MODEL, response.length, Date.now() - startTime);
        await logger.debug(`LLM Output preview`, {
            responsePreview: response.substring(0, 1000),
            responseLength: response.length,
        });

        const parsed = extractJSON<ParsedDocument>(response);
        await logger.parseResult(parsed.chapters.length, countVerses(parsed.chapters));
        
        if (parsed.chapters.length > 0) {
            await logger.debug(`Parsed chapters summary`, {
                chapters: parsed.chapters.map(ch => ({
                    number: ch.number,
                    title: ch.title,
                    verseCount: ch.verses.length,
                })),
            });
        }
        
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

    await ctx.logger.info(`Starting chunk processing`, {
        totalChunks: chunks.length,
        chunkSizes: chunks.map((c, i) => ({ chunk: i + 1, chars: c.text.length })),
        totalChars: chunks.reduce((sum, c) => sum + c.text.length, 0),
    });

    for (let i = 0; i < chunks.length; i++) {
        await ctx.logger.chunkProcessing(i, chunks.length, chunks[i].text.length);
        await ctx.logger.debug(`Chunk ${i + 1} content preview`, {
            chunkIndex: i,
            chunkLength: chunks[i].text.length,
            startPreview: chunks[i].text.substring(0, 300),
            endPreview: chunks[i].text.substring(chunks[i].text.length - 300),
        });

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
            await ctx.logger.info(`Chunk ${i + 1} stored successfully`, {
                chaptersInChunk: parsed.chapters.length,
                versesInChunk: countVerses(parsed.chapters),
            });
        } else {
            await ctx.logger.warn(`Chunk ${i + 1} returned no parsed data`);
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

// ------------------------
// Automatic analysis
// ------------------------
interface VerseRowForAnalysis {
    id: string;
    book_id: string;
    chapter_number: number;
    verse_number: number;
    original_text: string;
    translation: string;
    analyzed: boolean;
}

const buildAnalysisPrompt = (bookTitle: string, verse: VerseRowForAnalysis): string => `Book: ${bookTitle}\nChapter: ${verse.chapter_number}\nVerse: ${verse.verse_number}\n\nOriginal Text:\n${verse.original_text}\n\nTranslation:\n${verse.translation}\n\nAnalyze this verse from a critical modern perspective (2026).`;

const generateAnalysis = async (bookTitle: string, verse: VerseRowForAnalysis) => {
    const systemPrompt = loadPrompt('analyze-verse');
    const userPrompt = buildAnalysisPrompt(bookTitle, verse);
    const response = await complete(systemPrompt, userPrompt, {temperature: 0.3, maxTokens: 2000});
    return extractJSON<{
        modernEthics: string;
        genderAnalysis: string;
        casteAnalysis: string;
        contradictions: string;
        problematicScore: number;
        tags: string[];
        summary: string;
    }>(response);
};

async function runWithConcurrency<T>(items: T[], limit: number, work: (item: T, idx: number) => Promise<void>) {
    let i = 0;
    const workers = Array.from({length: Math.max(1, limit)}, () => (async () => {
        while (true) {
            const idx = i++;
            if (idx >= items.length) break;
            await work(items[idx], idx);
        }
    })());
    await Promise.all(workers);
}

async function runAutomaticAnalysis(bookId: string, bookTitle: string, logger: ProcessingLogger) {
    const verses = await getVersesByBookId(bookId) as VerseRowForAnalysis[];
    const targets = verses.filter(v => !v.analyzed);
    if (targets.length === 0) {
        await logger.info('No unanalyzed verses found');
        return;
    }

    await logger.info(`Starting automatic analysis for ${targets.length} verses`, {concurrency: ANALYSIS_CONCURRENCY});

    await runWithConcurrency(targets, ANALYSIS_CONCURRENCY, async (v) => {
        try {
            await logger.analysisStart(v.id, v.chapter_number, v.verse_number);
            const a = await generateAnalysis(bookTitle, v);
            await insertAnalysis({
                verseId: v.id,
                model: MODEL,
                modernEthics: a.modernEthics,
                genderAnalysis: a.genderAnalysis,
                casteAnalysis: a.casteAnalysis,
                contradictions: a.contradictions,
                problematicScore: a.problematicScore,
                tags: a.tags,
                summary: a.summary,
            });
            await updateVerseAnalyzed(v.id);
            await logger.analysisComplete(v.id, a.problematicScore, a.tags);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await logger.warn(`Analysis failed for verse ${v.chapter_number}:${v.verse_number}: ${msg}`);
        }
    });

    await logger.info('Automatic analysis complete');
}

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

// Optional: automatic analysis after parsing
try {
    await runAutomaticAnalysis(book.id, parsed.title, logger);
} catch (e) {
    await logger.warn('Automatic analysis step failed', {error: e instanceof Error ? e.message : String(e)});
}

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
