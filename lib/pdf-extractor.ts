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

    // Fast path first: merge all pages in one pass
    try {
        await log('extracting', 'Fast path: mergePages=true');
        const fast = await withTimeout(extractText(data, { mergePages: true }), 60000, 'extractText (fast)');
        await log('complete', `Extraction complete: ${fast.text.length} characters`, {
            characters: fast.text.length,
            path: 'fast',
        });
        return fast.text;
    } catch (e) {
        await log('extracting', `Fast path failed; trying page-by-page`, { error: e instanceof Error ? e.message : String(e) });
    }

    // Slow path: page-by-page
    await log('parsing', 'Loading PDF document...');
    const parseStart = Date.now();
    const pdf = await withTimeout(getDocumentProxy(data), 60000, 'getDocumentProxy');
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

export function chunkText(text: string, maxChunkSize: number = 25000): TextChunk[] {
    const chunks: TextChunk[] = [];
    let startIndex = 0;

    while (startIndex < text.length) {
        const endIndex = Math.min(startIndex + maxChunkSize, text.length);
        const chunkText = text.slice(startIndex, endIndex);

        chunks.push({
            text: chunkText,
            page: 0, // We'll track this later if needed
            startIndex,
            endIndex,
        });

        startIndex = endIndex;
    }

    return chunks;
}

export function isPDF(mimeType: string): boolean {
    return mimeType === 'application/pdf';
}
