import {extractText, getDocumentProxy} from 'unpdf';

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
    
    await log('parsing', 'Loading PDF document...');
    const startParse = Date.now();
    const pdf = await getDocumentProxy(data);
    const parseTime = Date.now() - startParse;
    await log('parsing', `PDF loaded: ${pdf.numPages} pages`, { numPages: pdf.numPages, parseTimeMs: parseTime });
    
    await log('extracting', `Extracting text from ${pdf.numPages} pages...`);
    const startExtract = Date.now();
    let resultText: string;
    try {
        const result = await extractText(data, { mergePages: true });
        resultText = result.text;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Surface a more actionable error
        throw new Error(`unpdf extractText failed: ${msg}`);
    }
    const extractTime = Date.now() - startExtract;
    
    await log('complete', `Extraction complete: ${resultText.length} characters`, {
        characters: resultText.length,
        extractTimeMs: extractTime,
        totalTimeMs: parseTime + extractTime,
    });
    
    return resultText;
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
