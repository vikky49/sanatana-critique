import { NextRequest, NextResponse } from 'next/server';
import { NeonDatabase } from '@/lib/neon-db';
import { complete, extractJSON } from '@/lib/llm';
import { loadPrompt } from '@/lib/prompts';
import { insertBook, insertChapter, insertVerse } from '@/lib/db-operations';
import { extractTextFromPDF, chunkText, isPDF } from '@/lib/pdf-extractor';

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

async function parseDocument(text: string): Promise<ParsedDocument> {
  const systemPrompt = loadPrompt('parse-document');
  
  // If text is too large, chunk it and parse in multiple requests
  const maxChunkSize = 25000;
  if (text.length > maxChunkSize) {
    console.log(`Text is ${text.length} chars, chunking into smaller pieces...`);
    const chunks = chunkText(text, maxChunkSize);
    
    // Parse first chunk to get structure
    const firstChunk = chunks[0];
    const userPrompt = `Parse this religious text (part 1 of ${chunks.length}):\n\n${firstChunk.text}`;
    
    const response = await complete(systemPrompt, userPrompt, {
      maxTokens: 16000,
    });
    
    const parsed = extractJSON<ParsedDocument>(response);
    
    // TODO: Parse remaining chunks and merge results
    // For now, just return first chunk results
    console.log(`Parsed first chunk. Found ${parsed.chapters.length} chapters.`);
    return parsed;
  }
  
  // Small text, parse in one go
  const userPrompt = `Parse this religious text:\n\n${text}`;

  const response = await complete(systemPrompt, userPrompt, {
    maxTokens: 16000,
  });

  return extractJSON<ParsedDocument>(response);
}

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
    const { documentId } = await request.json();

    if (!documentId) {
      return NextResponse.json(
        { message: 'Document ID required' },
        { status: 400 }
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
      { message: 'Processing failed', error: message },
      { status: 500 }
    );
  }
}
