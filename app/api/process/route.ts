import {NextRequest, NextResponse} from 'next/server';
import {NeonDatabase} from '@/lib/neon-db';
import {complete, extractJSON} from '@/lib/llm';
import {loadPrompt} from '@/lib/prompts';
import {insertBook, insertChapter, insertVerse} from '@/lib/db-operations';
import {extractTextFromPDF, chunkText, isPDF} from '@/lib/pdf-extractor';
import {createLogger, ProcessingLogger} from '@/lib/processing-logger';

const db = new NeonDatabase();

interface ParsedDocument {
    title: string;
    description: string;
    language: string;
    chapters: Array<{
        number: number;
        title: string;
        verses: Array<{
            number: number;
            originalText: string;
            translation: string;
        }>;
    }>;
}

async function getDocumentText(documentId: string, logger: ProcessingLogger): Promise<string> {
    const document = await db.getDocument(documentId);

    if (!document || !document.rawTextUrl) {
        throw new Error('Document not found');
    }

    await logger.info(`Document type: ${document.fileType}`);
    const base64Data = document.rawTextUrl.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    await logger.info(`Document size: ${(buffer.length / 1024).toFixed(1)} KB`);

    // Extract text from PDF if needed
    if (isPDF(document.fileType)) {
        await logger.info('Extracting text from PDF...');
        try {
            const text = await extractTextFromPDF(buffer);
            await logger.info(`Extracted ${text.length} characters from PDF`);
            return text;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            await logger.error(`PDF extraction failed: ${errorMsg}`);
            throw new Error(`Failed to extract text from PDF: ${errorMsg}`);
        }
    }

    // Otherwise treat as plain text
    await logger.info('Processing as plain text');
    return buffer.toString('utf-8');
}

// Pure function: Parse a single chunk
async function parseChunk(
    chunkText: string,
    chunkIndex: number,
    totalChunks: number,
    systemPrompt: string,
    logger: ProcessingLogger
): Promise<ParsedDocument | null> {
    const userPrompt = `Parse this religious text (part ${chunkIndex + 1} of ${totalChunks}):\n\n${chunkText}\n\nReturn chapters and verses found in this section.`;

    try {
        const startTime = Date.now();
        await logger.llmRequest('llama-3.3-70b-versatile', userPrompt.length, {maxTokens: 16000});

        const response = await complete(systemPrompt, userPrompt, {maxTokens: 16000});

        await logger.llmResponse('llama-3.3-70b-versatile', response.length, Date.now() - startTime);

        const parsed = extractJSON<ParsedDocument>(response);
        if (parsed) {
            const verseCount = parsed.chapters.reduce((sum, ch) => sum + ch.verses.length, 0);
            await logger.parseResult(parsed.chapters.length, verseCount);
        }
        return parsed;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        await logger.error(`Failed to parse chunk ${chunkIndex + 1}: ${errorMsg}`);
        return null;
    }
}

// Pure function: Merge chapters from multiple parsed documents
const mergeChapters = (chapters: ParsedDocument['chapters'][]): ParsedDocument['chapters'] => {
    const chapterMap = new Map<number, ParsedDocument['chapters'][0]>();

    chapters.forEach(chapterList => {
        chapterList.forEach(chapter => {
            const existing = chapterMap.get(chapter.number);
            if (existing) {
                existing.verses.push(...chapter.verses);
            } else {
                chapterMap.set(chapter.number, {...chapter});
            }
        });
    });

    return Array.from(chapterMap.values()).sort((a, b) => a.number - b.number);
};

// Pure function: Extract metadata from first valid document
const extractMetadata = (documents: (ParsedDocument | null)[]): Pick<ParsedDocument, 'title' | 'description' | 'language'> => {
    const firstValid = documents.find(doc => doc !== null);
    return {
        title: firstValid?.title || 'Unknown',
        description: firstValid?.description || 'No description',
        language: firstValid?.language || 'Unknown',
    };
};

const MAX_CHUNK_SIZE = 25000;

const buildUserPrompt = (text: string, chunkInfo?: { index: number; total: number }): string =>
    chunkInfo
        ? `Parse this religious text (part ${chunkInfo.index + 1} of ${chunkInfo.total}):\n\n${text}\n\nReturn chapters and verses found in this section.`
        : `Parse this religious text:\n\n${text}`;

const parseSingleDocument = async (
    text: string,
    systemPrompt: string
): Promise<ParsedDocument> => {
    const userPrompt = buildUserPrompt(text);
    const response = await complete(systemPrompt, userPrompt, {maxTokens: 16000});
    return extractJSON<ParsedDocument>(response);
};

const parseChunksSequentially = async (
    chunks: Array<{ text: string }>,
    systemPrompt: string,
    logger: ProcessingLogger
): Promise<(ParsedDocument | null)[]> => {
    const results: (ParsedDocument | null)[] = [];
    for (let i = 0; i < chunks.length; i++) {
        await logger.chunkProcessing(i, chunks.length, chunks[i].text.length);
        const result = await parseChunk(chunks[i].text, i, chunks.length, systemPrompt, logger);
        results.push(result);
    }
    return results;
};

const combineChunkedResults = (parsedDocs: (ParsedDocument | null)[]): ParsedDocument => {
    const validDocs = parsedDocs.filter((doc): doc is ParsedDocument => doc !== null);
    const metadata = extractMetadata(validDocs);
    const mergedChapters = mergeChapters(validDocs.map(doc => doc.chapters));

    return {...metadata, chapters: mergedChapters};
};

const parseDocument = async (text: string, logger: ProcessingLogger): Promise<ParsedDocument> => {
    const systemPrompt = loadPrompt('parse-document');

    if (text.length <= MAX_CHUNK_SIZE) {
        await logger.info('Document fits in single chunk, parsing directly');
        const startTime = Date.now();
        await logger.llmRequest('llama-3.3-70b-versatile', text.length, {maxTokens: 16000});

        const result = await parseSingleDocument(text, systemPrompt);

        await logger.llmResponse('llama-3.3-70b-versatile', JSON.stringify(result).length, Date.now() - startTime);
        const verseCount = result.chapters.reduce((sum, ch) => sum + ch.verses.length, 0);
        await logger.parseResult(result.chapters.length, verseCount);
        return result;
    }

    const numChunks = Math.ceil(text.length / MAX_CHUNK_SIZE);
    await logger.info(`Document is ${text.length} chars, splitting into ${numChunks} chunks`, {
        textLength: text.length,
        maxChunkSize: MAX_CHUNK_SIZE,
        numChunks,
    });

    const chunks = chunkText(text, MAX_CHUNK_SIZE);
    await logger.info(`Starting sequential parsing of ${chunks.length} chunks`);

    const parsedDocs = await parseChunksSequentially(chunks, systemPrompt, logger);
    const result = combineChunkedResults(parsedDocs);

    const totalVerses = result.chapters.reduce((sum, ch) => sum + ch.verses.length, 0);
    await logger.info(`Parsing complete: ${result.chapters.length} chapters, ${totalVerses} verses total`);

    return result;
};

async function storeParsedData(documentId: string, parsed: ParsedDocument, logger: ProcessingLogger) {
    const totalVerses = parsed.chapters.reduce((sum, ch) => sum + ch.verses.length, 0);

    await logger.info(`Storing book: "${parsed.title}"`, {
        title: parsed.title,
        language: parsed.language,
        chapters: parsed.chapters.length,
        verses: totalVerses,
    });

    const book = await insertBook({
        documentId,
        title: parsed.title,
        description: parsed.description,
        language: parsed.language,
        totalChapters: parsed.chapters.length,
        totalVerses,
    });

    for (const chapter of parsed.chapters) {
        await logger.info(`Storing Chapter ${chapter.number}: ${chapter.title} (${chapter.verses.length} verses)`);

        await insertChapter({
            bookId: book.id,
            number: chapter.number,
            title: chapter.title,
            verseCount: chapter.verses.length,
        });

        for (const verse of chapter.verses) {
            await insertVerse({
                bookId: book.id,
                chapterNumber: chapter.number,
                verseNumber: verse.number,
                originalText: verse.originalText,
                translation: verse.translation,
            });
        }
    }

    await logger.info(`Book stored successfully with ID: ${book.id}`);
    return book;
}

export async function POST(request: NextRequest) {
    let logger: ProcessingLogger | null = null;

    try {
        const {documentId} = await request.json();

        if (!documentId) {
            return NextResponse.json(
                {message: 'Document ID required'},
                {status: 400}
            );
        }

        logger = createLogger(documentId);
        await logger.info('Starting document processing');

        const text = await getDocumentText(documentId, logger);
        const parsed = await parseDocument(text, logger);
        const book = await storeParsedData(documentId, parsed, logger);

        await logger.info('Processing completed successfully', {
            bookId: book.id,
            title: book.title,
            chapters: book.totalChapters,
            verses: book.totalVerses,
        });

        return NextResponse.json({
            success: true,
            book: {
                id: book.id,
                title: book.title,
                totalChapters: book.totalChapters,
                totalVerses: book.totalVerses,
            },
            documentId,
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (logger) {
            await logger.error(`Processing failed: ${message}`);
        }

        return NextResponse.json(
            {message: 'Processing failed', error: message},
            {status: 500}
        );
    }
}
