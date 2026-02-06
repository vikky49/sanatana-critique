import { readFileSync } from 'fs';
import { extractTextFromPDF, chunkText } from './lib/pdf-extractor';
import { complete, extractJSON } from './lib/llm';
import { loadPrompt } from './lib/prompts';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development.local' });

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

async function testPDFExtraction() {
  console.log('Testing PDF Extraction and Parsing\n');
  
  // Step 1: Read PDF file
  console.log('Step 1: Reading PDF file...');
  const pdfPath = './test-resources/bhagavad-gita.pdf';
  const buffer = readFileSync(pdfPath);
  console.log(`Read ${buffer.length} bytes`);
  
  // Step 2: Extract text from PDF
  console.log('\nStep 2: Extracting text from PDF...');
  const text = await extractTextFromPDF(buffer);
  console.log(`Extracted ${text.length} characters`);
  console.log(`First 300 chars: ${text.slice(0, 300)}\n`);
  
  // Step 3: Chunk text if needed
  console.log('Step 3: Checking if chunking is needed...');
  const maxChunkSize = 25000;
  if (text.length > maxChunkSize) {
    const chunks = chunkText(text, maxChunkSize);
    console.log(`Text is large (${text.length} chars), created ${chunks.length} chunks`);
    console.log(`Chunk sizes: ${chunks.map(c => c.text.length).join(', ')}`);
    
    // Step 4: Parse first chunk with LLM
    console.log('\nStep 4: Parsing first chunk with LLM...');
    const systemPrompt = loadPrompt('parse-document');
    const userPrompt = `Parse this religious text (part 1 of ${chunks.length}):\n\n${chunks[0].text}`;
    
    console.log('Sending to Groq LLM...');
    const response = await complete(systemPrompt, userPrompt, {
      maxTokens: 16000,
    });
    
    console.log('Received response from LLM');
    
    // Step 5: Extract JSON from response
    console.log('\nStep 5: Extracting structured data...');
    const parsed: ParsedDocument = extractJSON(response);
    
    console.log('Successfully parsed!');
    console.log(`Title: ${parsed.title}`);
    console.log(`Description: ${parsed.description.slice(0, 100)}...`);
    console.log(`Language: ${parsed.language}`);
    console.log(`Chapters found: ${parsed.chapters.length}`);
    
    if (parsed.chapters.length > 0) {
      console.log('\nFirst chapter:');
      const ch = parsed.chapters[0];
      console.log(`  Chapter ${ch.number}: ${ch.title}`);
      console.log(`  Verses: ${ch.verses.length}`);
      
      if (ch.verses.length > 0) {
        console.log('\nFirst verse:');
        const v = ch.verses[0];
        console.log(`  ${ch.number}.${v.number}:`);
        console.log(`  Original: ${v.originalText.slice(0, 100)}...`);
        console.log(`  Translation: ${v.translation.slice(0, 100)}...`);
      }
    }
    
    console.log('\nTEST PASSED - PDF extraction and parsing working!');
    
  } else {
    console.log(`Text is small (${text.length} chars), no chunking needed`);
    
    // Parse the whole text
    console.log('\nStep 4: Parsing with LLM...');
    const systemPrompt = loadPrompt('parse-document');
    const userPrompt = `Parse this religious text:\n\n${text}`;
    
    const response = await complete(systemPrompt, userPrompt, {
      maxTokens: 16000,
    });
    
    const parsed: ParsedDocument = extractJSON(response);
    
    console.log(`Parsed: ${parsed.title}`);
    console.log(`Chapters: ${parsed.chapters.length}`);
    console.log(`Total verses: ${parsed.chapters.reduce((sum, ch) => sum + ch.verses.length, 0)}`);
  }
}

// Run the test
testPDFExtraction().catch(error => {
  console.error('\nTEST FAILED');
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
});
