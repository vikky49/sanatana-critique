import {extractText} from 'unpdf';

export interface TextChunk {
    text: string;
    page: number;
    startIndex: number;
    endIndex: number;
}

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
    // Convert Buffer to Uint8Array for unpdf
    const data = new Uint8Array(buffer);
    const result = await extractText(data, {mergePages: true});
    return result.text;
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
