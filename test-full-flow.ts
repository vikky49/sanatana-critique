import { readFileSync } from 'fs';
import { neon } from '@neondatabase/serverless';
import { NeonDatabase } from './lib/neon-db';
import { extractTextFromPDF, chunkText, isPDF } from './lib/pdf-extractor';
import { complete, extractJSON } from './lib/llm';
import { loadPrompt } from './lib/prompts';
import { insertBook, insertChapter, insertVerse } from './lib/db-operations';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development.local' });

const sql = neon(process.env.DATABASE_URL!);
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

async function testFullFlow() {
  console.log('========================================');
  console.log('FULL PRODUCTION FLOW SIMULATION');
  console.log('========================================\n');

  // STEP 1: SIMULATE UPLOAD
  console.log('STEP 1: Simulating file upload...');
  const pdfPath = './test-resources/bhagavad-gita.pdf';
  const buffer = readFileSync(pdfPath);
  const fileType = 'application/pdf';
  
  console.log(`File size: ${buffer.length} bytes`);
  console.log(`File type: ${fileType}`);
  
  // Store as base64 (like upload API does)
  const base64Data = buffer.toString('base64');
  const rawTextUrl = `data:${fileType};base64,${base64Data}`;
  
  const document = await db.createDocument({
    filename: 'bhagavad-gita.pdf',
    fileType: fileType,
    size: buffer.length,
    status: 'uploaded',
    rawTextUrl: rawTextUrl,
  });
  
  console.log(`Document created with ID: ${document.id}\n`);

  // STEP 2: SIMULATE PROCESS API - EXTRACT TEXT
  console.log('STEP 2: Extracting text from document...');
  
  const doc = await db.getDocument(document.id);
  if (!doc || !doc.rawTextUrl) {
    throw new Error('Document not found');
  }
  
  console.log(`Retrieved document, file type: ${doc.fileType}`);
  
  // Extract base64 data
  const base64Content = doc.rawTextUrl.split(',')[1];
  const contentBuffer = Buffer.from(base64Content, 'base64');
  console.log(`Decoded buffer size: ${contentBuffer.length} bytes`);
  
  // Check if PDF
  if (isPDF(doc.fileType)) {
    console.log('Detected PDF, extracting text...');
    try {
      const text = await extractTextFromPDF(contentBuffer);
      console.log(`Successfully extracted ${text.length} characters`);
      console.log(`First 200 chars: ${text.slice(0, 200)}\n`);
      
      // STEP 3: CHUNK TEXT
      console.log('STEP 3: Chunking text...');
      const maxChunkSize = 25000;
      const chunks = chunkText(text, maxChunkSize);
      console.log(`Created ${chunks.length} chunks`);
      console.log(`First chunk size: ${chunks[0].text.length} chars\n`);
      
      // STEP 4: PARSE WITH LLM
      console.log('STEP 4: Parsing first chunk with LLM...');
      const systemPrompt = loadPrompt('parse-document');
      const userPrompt = `Parse this religious text (part 1 of ${chunks.length}):\n\n${chunks[0].text}`;
      
      console.log('Sending to Groq...');
      const response = await complete(systemPrompt, userPrompt, {
        maxTokens: 16000,
      });
      
      console.log('Received LLM response\n');
      
      // STEP 5: EXTRACT JSON
      console.log('STEP 5: Extracting structured data...');
      const parsed: ParsedDocument = extractJSON(response);
      
      console.log(`Title: ${parsed.title}`);
      console.log(`Description: ${parsed.description.slice(0, 100)}...`);
      console.log(`Language: ${parsed.language}`);
      console.log(`Chapters: ${parsed.chapters.length}\n`);
      
      // STEP 6: STORE IN DATABASE
      console.log('STEP 6: Storing in database...');
      
      const totalVerses = parsed.chapters.reduce((sum, ch) => sum + ch.verses.length, 0);
      
      const book = await insertBook({
        documentId: document.id,
        title: parsed.title,
        description: parsed.description,
        language: parsed.language,
        totalChapters: parsed.chapters.length,
        totalVerses,
      });
      
      console.log(`Book created: ${book.id}`);
      
      for (const chapter of parsed.chapters) {
        await insertChapter({
          bookId: book.id,
          number: chapter.number,
          title: chapter.title,
          verseCount: chapter.verses.length,
        });
        
        console.log(`Chapter ${chapter.number}: ${chapter.title} (${chapter.verses.length} verses)`);
        
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
      
      console.log(`\nStored ${totalVerses} verses\n`);
      
      // STEP 7: VERIFY
      console.log('STEP 7: Verifying stored data...');
      const storedBook = await sql`SELECT * FROM books WHERE id = ${book.id}`;
      const storedChapters = await sql`SELECT * FROM chapters WHERE book_id = ${book.id}`;
      const storedVerses = await sql`SELECT * FROM verses WHERE book_id = ${book.id} LIMIT 3`;
      
      console.log('Book:', storedBook[0]);
      console.log('\nChapters:', storedChapters.length);
      console.log('\nFirst 3 verses:');
      storedVerses.forEach((v: any) => {
        console.log(`  ${v.chapter_number}.${v.verse_number}: ${v.original_text.slice(0, 50)}...`);
      });
      
      console.log('\n========================================');
      console.log('TEST PASSED - Full flow working!');
      console.log('========================================');
      
    } catch (error) {
      console.error('PDF extraction failed:', error);
      throw error;
    }
  } else {
    console.log('Not a PDF, treating as plain text');
    const text = contentBuffer.toString('utf-8');
    console.log(`Text length: ${text.length}`);
    console.log(`First 200 chars: ${text.slice(0, 200)}`);
  }
}

// Run the test
testFullFlow().catch(error => {
  console.error('\n========================================');
  console.error('TEST FAILED');
  console.error('========================================');
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
});
