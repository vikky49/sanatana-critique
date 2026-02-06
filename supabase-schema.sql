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
  embedding vector(1536),
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

-- Indexes for performance
CREATE INDEX idx_verses_book_chapter ON verses(book_id, chapter_number);
CREATE INDEX idx_analyses_verse ON analyses(verse_id);
CREATE INDEX idx_analyses_score ON analyses(problematic_score);
CREATE INDEX idx_jobs_status ON processing_jobs(status);
CREATE INDEX idx_books_created ON books(created_at DESC);

-- Enable pgvector for semantic search
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX idx_verses_embedding ON verses USING ivfflat (embedding vector_cosine_ops);
