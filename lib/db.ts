/**
 * Database layer - abstract interface for storage
 * Can be implemented with Postgres or other backends
 */

import type {
  Document,
  Book,
  Chapter,
  Verse,
  Analysis,
  ProcessingJob,
  SearchParams,
  SearchResult,
} from '@/types';

export interface Database {
  // Documents
  createDocument(doc: Omit<Document, 'id' | 'uploadedAt'>): Promise<Document>;
  getDocument(id: string): Promise<Document | null>;
  updateDocumentStatus(id: string, status: Document['status']): Promise<void>;

  // Books
  createBook(book: Omit<Book, 'id' | 'createdAt'>): Promise<Book>;
  getBook(id: string): Promise<Book | null>;
  listBooks(): Promise<Book[]>;
  updateBook(id: string, updates: Partial<Book>): Promise<void>;

  // Chapters
  createChapter(chapter: Omit<Chapter, 'id'>): Promise<Chapter>;
  getChaptersByBook(bookId: string): Promise<Chapter[]>;

  // Verses
  createVerse(verse: Omit<Verse, 'id'>): Promise<Verse>;
  getVerse(id: string): Promise<Verse | null>;
  getVersesByChapter(bookId: string, chapterNumber: number): Promise<Verse[]>;
  getVersesByBook(bookId: string): Promise<Verse[]>;
  updateVerseAnalysisStatus(id: string, analyzed: boolean): Promise<void>;

  // Analysis
  createAnalysis(analysis: Omit<Analysis, 'id' | 'generatedAt'>): Promise<Analysis>;
  getAnalysisByVerse(verseId: string): Promise<Analysis | null>;
  getAnalysesByBook(bookId: string): Promise<Analysis[]>;

  // Processing Jobs
  createJob(job: Omit<ProcessingJob, 'id' | 'startedAt'>): Promise<ProcessingJob>;
  getJob(id: string): Promise<ProcessingJob | null>;
  updateJob(id: string, updates: Partial<ProcessingJob>): Promise<void>;
  listActiveJobs(): Promise<ProcessingJob[]>;

  // Search
  searchVerses(params: SearchParams): Promise<SearchResult[]>;
  semanticSearch(embedding: number[], limit: number): Promise<SearchResult[]>;
}

/**
 * SQL Schema for PostgreSQL
 */
export const SQL_SCHEMA = `
-- Documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  title TEXT,
  file_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,
  raw_text_url TEXT
);

-- Books table
CREATE TABLE books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  language TEXT NOT NULL,
  era TEXT,
  author TEXT,
  total_chapters INTEGER NOT NULL DEFAULT 0,
  total_verses INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  embeddings BOOLEAN DEFAULT FALSE
);

-- Chapters table
CREATE TABLE chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES books(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  verse_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(book_id, number)
);

-- Verses table
CREATE TABLE verses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES books(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  verse_number INTEGER NOT NULL,
  original_text TEXT NOT NULL,
  transliteration TEXT,
  translation TEXT NOT NULL,
  speaker TEXT,
  context TEXT,
  embedding vector(1536), -- For pgvector
  analyzed BOOLEAN DEFAULT FALSE,
  UNIQUE(book_id, chapter_number, verse_number)
);

-- Analyses table
CREATE TABLE analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verse_id UUID REFERENCES verses(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modern_ethics TEXT,
  gender_analysis TEXT,
  caste_analysis TEXT,
  contradictions TEXT,
  historical_context TEXT,
  problematic_score INTEGER NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL,
  citations TEXT[] DEFAULT '{}',
  UNIQUE(verse_id)
);

-- Processing Jobs table
CREATE TABLE processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  book_id UUID REFERENCES books(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  current_step TEXT,
  total_items INTEGER NOT NULL DEFAULT 0,
  processed_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error TEXT,
  estimated_time_remaining INTEGER
);

-- Processing Logs table
CREATE TABLE processing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_verses_book_chapter ON verses(book_id, chapter_number);
CREATE INDEX idx_analyses_verse ON analyses(verse_id);
CREATE INDEX idx_analyses_score ON analyses(problematic_score);
CREATE INDEX idx_jobs_status ON processing_jobs(status);
CREATE INDEX idx_books_created ON books(created_at DESC);
CREATE INDEX idx_processing_logs_document ON processing_logs(document_id, created_at);

-- Enable pgvector for semantic search
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX idx_verses_embedding ON verses USING ivfflat (embedding vector_cosine_ops);
`;

/**
 * In-memory implementation for development
 */
export class InMemoryDatabase implements Database {
  private documents = new Map<string, Document>();
  private books = new Map<string, Book>();
  private chapters = new Map<string, Chapter>();
  private verses = new Map<string, Verse>();
  private analyses = new Map<string, Analysis>();
  private jobs = new Map<string, ProcessingJob>();

  async createDocument(doc: Omit<Document, 'id' | 'uploadedAt'>): Promise<Document> {
    const id = crypto.randomUUID();
    const document: Document = {
      ...doc,
      id,
      uploadedAt: new Date(),
    };
    this.documents.set(id, document);
    return document;
  }

  async getDocument(id: string): Promise<Document | null> {
    return this.documents.get(id) || null;
  }

  async updateDocumentStatus(id: string, status: Document['status']): Promise<void> {
    const doc = this.documents.get(id);
    if (doc) {
      doc.status = status;
    }
  }

  async createBook(book: Omit<Book, 'id' | 'createdAt'>): Promise<Book> {
    const id = crypto.randomUUID();
    const newBook: Book = {
      ...book,
      id,
      createdAt: new Date(),
    };
    this.books.set(id, newBook);
    return newBook;
  }

  async getBook(id: string): Promise<Book | null> {
    return this.books.get(id) || null;
  }

  async listBooks(): Promise<Book[]> {
    return Array.from(this.books.values());
  }

  async updateBook(id: string, updates: Partial<Book>): Promise<void> {
    const book = this.books.get(id);
    if (book) {
      Object.assign(book, updates);
    }
  }

  async createChapter(chapter: Omit<Chapter, 'id'>): Promise<Chapter> {
    const id = crypto.randomUUID();
    const newChapter: Chapter = { ...chapter, id };
    this.chapters.set(id, newChapter);
    return newChapter;
  }

  async getChaptersByBook(bookId: string): Promise<Chapter[]> {
    return Array.from(this.chapters.values())
      .filter(c => c.bookId === bookId)
      .sort((a, b) => a.number - b.number);
  }

  async createVerse(verse: Omit<Verse, 'id'>): Promise<Verse> {
    const id = crypto.randomUUID();
    const newVerse: Verse = { ...verse, id };
    this.verses.set(id, newVerse);
    return newVerse;
  }

  async getVerse(id: string): Promise<Verse | null> {
    return this.verses.get(id) || null;
  }

  async getVersesByChapter(bookId: string, chapterNumber: number): Promise<Verse[]> {
    return Array.from(this.verses.values())
      .filter(v => v.bookId === bookId && v.chapterNumber === chapterNumber)
      .sort((a, b) => a.verseNumber - b.verseNumber);
  }

  async getVersesByBook(bookId: string): Promise<Verse[]> {
    return Array.from(this.verses.values())
      .filter(v => v.bookId === bookId)
      .sort((a, b) => {
        if (a.chapterNumber !== b.chapterNumber) {
          return a.chapterNumber - b.chapterNumber;
        }
        return a.verseNumber - b.verseNumber;
      });
  }

  async updateVerseAnalysisStatus(id: string, analyzed: boolean): Promise<void> {
    const verse = this.verses.get(id);
    if (verse) {
      verse.analyzed = analyzed;
    }
  }

  async createAnalysis(analysis: Omit<Analysis, 'id' | 'generatedAt'>): Promise<Analysis> {
    const id = crypto.randomUUID();
    const newAnalysis: Analysis = {
      ...analysis,
      id,
      generatedAt: new Date(),
    };
    this.analyses.set(id, newAnalysis);
    return newAnalysis;
  }

  async getAnalysisByVerse(verseId: string): Promise<Analysis | null> {
    return Array.from(this.analyses.values()).find(a => a.verseId === verseId) || null;
  }

  async getAnalysesByBook(bookId: string): Promise<Analysis[]> {
    const bookVerses = await this.getVersesByBook(bookId);
    const verseIds = new Set(bookVerses.map(v => v.id));
    return Array.from(this.analyses.values()).filter(a => verseIds.has(a.verseId));
  }

  async createJob(job: Omit<ProcessingJob, 'id' | 'startedAt'>): Promise<ProcessingJob> {
    const id = crypto.randomUUID();
    const newJob: ProcessingJob = {
      ...job,
      id,
      startedAt: new Date(),
    };
    this.jobs.set(id, newJob);
    return newJob;
  }

  async getJob(id: string): Promise<ProcessingJob | null> {
    return this.jobs.get(id) || null;
  }

  async updateJob(id: string, updates: Partial<ProcessingJob>): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      Object.assign(job, updates);
    }
  }

  async listActiveJobs(): Promise<ProcessingJob[]> {
    return Array.from(this.jobs.values())
      .filter(j => j.status === 'parsing' || j.status === 'analyzing');
  }

  async searchVerses(params: SearchParams): Promise<SearchResult[]> {
    // Simple text search implementation
    const allVerses = Array.from(this.verses.values());
    let filtered = allVerses;

    if (params.bookIds) {
      filtered = filtered.filter(v => params.bookIds!.includes(v.bookId));
    }

    if (params.query) {
      const query = params.query.toLowerCase();
      filtered = filtered.filter(v =>
        v.translation.toLowerCase().includes(query) ||
        v.originalText.toLowerCase().includes(query)
      );
    }

    const results: SearchResult[] = [];
    for (const verse of filtered.slice(0, params.limit || 50)) {
      const analysis = await this.getAnalysisByVerse(verse.id);
      if (analysis) {
        if (params.minScore && analysis.problematicScore < params.minScore) continue;
        if (params.maxScore && analysis.problematicScore > params.maxScore) continue;
        
        results.push({
          verse,
          analysis,
          relevance: 1.0,
          highlights: [],
        });
      }
    }

    return results;
  }

  async semanticSearch(embedding: number[], limit: number): Promise<SearchResult[]> {
    // TODO: Implement cosine similarity search
    return [];
  }
}
