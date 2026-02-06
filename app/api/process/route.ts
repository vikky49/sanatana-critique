import {NextRequest, NextResponse} from 'next/server';
import {NeonDatabase} from '@/lib/neon-db';
import {complete, extractJSON} from '@/lib/llm';
import {loadPrompt} from '@/lib/prompts';
import {insertBook, insertChapter, insertVerse} from '@/lib/db-operations';
import {extractTextFromPDF, chunkText, isPDF} from '@/lib/pdf-extractor';

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

async function getDocumentText(documentId: string): Promise<string> {
    const document = await db.getDocument(documentId);

    if (!document || !document.rawTextUrl) {
        throw new Error('Document not found');
    }

    console.log('Document file type:', document.fileType);
    const base64Data = document.rawTextUrl.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    console.log('Buffer size:', buffer.length);

    // Extract text from PDF if needed
    if (isPDF(document.fileType)) {
        console.log('Detected PDF, extracting text...');
        try {
            const text = await extractTextFromPDF(buffer);
            console.log('Extracted text length:', text.length);
            console.log('First 200 chars:', text.slice(0, 200));
            return text;
        } catch (error) {
            console.error('PDF extraction failed:', error);
            throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // Otherwise treat as plain text
    console.log('Not a PDF, treating as plain text');
    return buffer.toString('utf-8');
}

// Pure function: Parse a single chunk
async function parseChunk(
    chunkText: string,
    chunkIndex: number,
    totalChunks: number,
    systemPrompt: string
): Promise<ParsedDocument | null> {
    const userPrompt = `Parse this religious text (part ${chunkIndex + 1} of ${totalChunks}):\n\n${chunkText}\n\nReturn chapters and verses found in this section.`;

    try {
        const response = await complete(systemPrompt, userPrompt, {maxTokens: 16000});
        return extractJSON<ParsedDocument>(response);
    } catch (error) {
        console.error(`Failed to parse chunk ${chunkIndex + 1}:`, error);
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
    systemPrompt: string
): Promise<(ParsedDocument | null)[]> => {
    const results: (ParsedDocument | null)[] = [];
    for (let i = 0; i < chunks.length; i++) {
        console.log(`Processing chunk ${i + 1}/${chunks.length}`);
        const result = await parseChunk(chunks[i].text, i, chunks.length, systemPrompt);
        results.push(result);
    }
    return results;
};

const combineChunkedResults = (parsedDocs: (ParsedDocument | null)[]): ParsedDocument => {
    const validDocs = parsedDocs.filter((doc): doc is ParsedDocument => doc !== null);
    const metadata = extractMetadata(validDocs);
    const mergedChapters = mergeChapters(validDocs.map(doc => doc.chapters));

    const totalVerses = mergedChapters.reduce((sum, ch) => sum + ch.verses.length, 0);
    console.log(`Parsing complete: ${mergedChapters.length} chapters, ${totalVerses} verses`);

    return {...metadata, chapters: mergedChapters};
};

const parseDocument = async (text: string): Promise<ParsedDocument> => {
    const systemPrompt = loadPrompt('parse-document');

    if (text.length <= MAX_CHUNK_SIZE) {
        return parseSingleDocument(text, systemPrompt);
    }

    console.log(`Text is ${text.length} chars, chunking into ${Math.ceil(text.length / MAX_CHUNK_SIZE)} pieces`);
    const chunks = chunkText(text, MAX_CHUNK_SIZE);
    console.log(`Parsing ${chunks.length} chunks sequentially`);

    const parsedDocs = await parseChunksSequentially(chunks, systemPrompt);
    return combineChunkedResults(parsedDocs);
};

async function storeParsedData(documentId: string, parsed: ParsedDocument) {
    const totalVerses = parsed.chapters.reduce((sum, ch) => sum + ch.verses.length, 0);

    const book = await insertBook({
        documentId,
        title: parsed.title,
        description: parsed.description,
        language: parsed.language,
        totalChapters: parsed.chapters.length,
        totalVerses,
    });

    for (const chapter of parsed.chapters) {
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

    return book;
}

export async function POST(request: NextRequest) {
    try {
        const {documentId} = await request.json();

        if (!documentId) {
            return NextResponse.json(
                {message: 'Document ID required'},
                {status: 400}
            );
        }

        const text = await getDocumentText(documentId);
        const parsed = await parseDocument(text);
        const book = await storeParsedData(documentId, parsed);

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

        return NextResponse.json(
            {message: 'Processing failed', error: message},
            {status: 500}
        );
    }
}
