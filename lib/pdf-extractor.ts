import pdf from 'pdf-parse';

export interface TextChunk {
  text: string;
  page: number;
  startIndex: number;
  endIndex: number;
}

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer);
  return data.text;
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
