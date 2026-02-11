import {extractText, getDocumentProxy} from 'unpdf';
import { mapSeries, range } from '@/lib/functional';

export interface TextChunk {
    text: string;
    page: number;
    startIndex: number;
    endIndex: number;
}

export interface PDFExtractionProgress {
    stage: 'loading' | 'parsing' | 'extracting' | 'complete';
    message: string;
    details?: Record<string, unknown>;
}

export type ProgressCallback = (progress: PDFExtractionProgress) => Promise<void>;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
        p.then(v => { clearTimeout(t); resolve(v); }).catch(e => { clearTimeout(t); reject(e); });
    });
}

async function yieldTick() { await new Promise(r => setTimeout(r, 0)); }

export async function extractTextFromPDF(
    buffer: Buffer,
    onProgress?: ProgressCallback
): Promise<string> {
    const log = async (stage: PDFExtractionProgress['stage'], message: string, details?: Record<string, unknown>) => {
        console.log(`[PDF] ${stage}: ${message}`, details || '');
        if (onProgress) {
            await onProgress({ stage, message, details });
        }
    };

    await log('loading', 'Converting buffer to Uint8Array', { bufferSize: buffer.length });
    const data = new Uint8Array(buffer);
    await log('loading', 'Uint8Array created', { arrayLength: data.length });

    const LARGE_FILE_THRESHOLD = 2 * 1024 * 1024; // 2MB
    const isLargeFile = buffer.length > LARGE_FILE_THRESHOLD;

    // Fast path: only for smaller files
    if (!isLargeFile) {
        try {
            await log('extracting', 'Fast path: mergePages=true (small file)');
            const fast = await withTimeout(extractText(data, { mergePages: true }), 60000, 'extractText (fast)');
            await log('complete', `Extraction complete: ${fast.text.length} characters`, {
                characters: fast.text.length,
                path: 'fast',
            });
            return fast.text;
        } catch (e) {
            await log('extracting', `Fast path failed; trying page-by-page`, { error: e instanceof Error ? e.message : String(e) });
        }
    } else {
        await log('extracting', 'Large file detected, using page-by-page extraction', { sizeBytes: buffer.length });
    }

    // Slow path: page-by-page (always used for large files)
    await log('parsing', 'Loading PDF document via getDocumentProxy...');
    const parseStart = Date.now();
    await yieldTick(); // Allow event loop to process
    const pdf = await withTimeout(getDocumentProxy(data), 120000, 'getDocumentProxy');
    const numPages = (pdf as any).numPages as number;
    await log('parsing', `PDF loaded: ${numPages} pages`, { numPages, parseTimeMs: Date.now() - parseStart });

    await log('extracting', `Extracting text page-by-page for ${numPages} pages...`);
    const parts: string[] = [];
    const pages = range(1, numPages);
    await mapSeries(pages, async (i, idx) => {
        try {
            const page = await withTimeout((pdf as any).getPage(i), 30000, `getPage(${i})`);
            const tc = await withTimeout((page as any).getTextContent(), 30000, `getTextContent(${i})`);
            const items = (tc as any).items || [];
            const pageText = items.map((it: any) => (it && it.str) ? it.str : '').join(' ');
            parts.push(pageText);
        } catch (err) {
            await log('extracting', `WARN: Failed to extract page ${i}`, { error: err instanceof Error ? err.message : String(err) });
        }
        const processed = idx + 1;
        if (processed % 10 === 0 || i === numPages) {
            await log('extracting', `Extracted ${processed}/${numPages} pages`, { extractedPages: processed, totalPages: numPages });
            await yieldTick();
        }
    });

    const text = parts.join('\n\n');
    await log('complete', `Extraction complete: ${text.length} characters`, {
        characters: text.length,
        path: 'slow',
    });
    return text;
}

// Helper: Find optimal break point near target index
const findBreakPoint = (
    text: string,
    targetEnd: number,
    startIndex: number
): number => {
    if (targetEnd >= text.length) return text.length;
    
    const searchStart = Math.max(targetEnd - 500, startIndex);
    const searchRegion = text.slice(searchStart, targetEnd);
    
    // Try paragraph break first
    const lastParaBreak = searchRegion.lastIndexOf('\n\n');
    if (lastParaBreak > 0) {
        return searchStart + lastParaBreak + 2;
    }
    
    // Fall back to sentence break
    const lastPeriod = searchRegion.lastIndexOf('. ');
    if (lastPeriod > 0) {
        return searchStart + lastPeriod + 2;
    }
    
    return targetEnd;
};

// Helper: Generate chunk boundaries as array of [start, end] pairs
// Uses functional/recursive approach instead of loops
const generateChunkBoundaries = (
    textLength: number,
    maxChunkSize: number,
    text: string
): Array<[number, number]> => {
    const buildBoundaries = (
        start: number,
        acc: Array<[number, number]>
    ): Array<[number, number]> => {
        if (start >= textLength) return acc;
        
        const targetEnd = Math.min(start + maxChunkSize, textLength);
        const actualEnd = findBreakPoint(text, targetEnd, start);
        
        // Safety: prevent infinite recursion
        if (actualEnd <= start) return acc;
        
        return buildBoundaries(
            actualEnd,
            [...acc, [start, actualEnd]]
        );
    };
    
    return buildBoundaries(0, []);
};

export function chunkText(
    text: string,
    maxChunkSize: number = 12000
): TextChunk[] {
    const boundaries = generateChunkBoundaries(
        text.length,
        maxChunkSize,
        text
    );
    
    return boundaries
        .map(([startIndex, endIndex]) => ({
            text: text.slice(startIndex, endIndex).trim(),
            page: 0,
            startIndex,
            endIndex,
        }))
        .filter(chunk => chunk.text.length > 0);
}

export function isPDF(mimeType: string): boolean {
    return mimeType === 'application/pdf';
}
