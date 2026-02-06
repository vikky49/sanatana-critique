// ==================== Core Entities ====================

export interface Document {
  id: string;
  filename: string;
  title?: string;
  fileType: string;
  size: number;
  uploadedAt: Date;
  status: ProcessingStatus;
  rawTextUrl?: string; // S3/Blob storage URL
}

export interface Book {
  id: string;
  documentId: string;
  title: string;
  description: string;
  language: string;
  era?: string;
  author?: string;
  totalChapters: number;
  totalVerses: number;
  createdAt: Date;
  processedAt?: Date;
  embeddings?: boolean; // Whether semantic search is enabled
}

export interface Chapter {
  id: string;
  bookId: string;
  number: number;
  title: string;
  description?: string;
  verseCount: number;
}

export interface Verse {
  id: string;
  bookId: string;
  chapterNumber: number;
  verseNumber: number;
  originalText: string;
  transliteration?: string;
  translation: string;
  speaker?: string;
  context?: string;
  embedding?: number[]; // Vector for semantic search
  analyzed: boolean;
}

export interface Analysis {
  id: string;
  verseId: string;
  model: LLMModel;
  generatedAt: Date;
  
  // Multi-perspective analysis
  modernEthics?: string;
  genderAnalysis?: string;
  casteAnalysis?: string;
  contradictions?: string;
  historicalContext?: string;
  
  // Metadata
  problematicScore: number; // 0-10
  tags: string[];
  summary: string;
  citations?: string[]; // References to other verses
}

// ==================== AI Processing ====================

export type LLMModel = 
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'claude-3-5-sonnet'
  | 'claude-3-5-haiku';

export type ProcessingStatus =
  | 'uploaded'
  | 'parsing'
  | 'parsed'
  | 'analyzing'
  | 'completed'
  | 'failed';

export interface ProcessingJob {
  id: string;
  documentId?: string;
  bookId?: string;
  type: 'parse' | 'analyze' | 'embed';
  status: ProcessingStatus;
  progress: number; // 0-100
  currentStep?: string;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  estimatedTimeRemaining?: number; // seconds
}

export interface ParsedDocument {
  title: string;
  description: string;
  language?: string;
  era?: string;
  author?: string;
  structure: ParsedChapter[];
  confidence: number; // AI confidence 0-1
}

export interface ParsedChapter {
  number: number;
  title: string;
  description?: string;
  verses: ParsedVerse[];
}

export interface ParsedVerse {
  number: number;
  originalText: string;
  transliteration?: string;
  translation: string;
  speaker?: string;
  context?: string;
}

// ==================== Configuration ====================

export interface AnalysisConfig {
  model: LLMModel;
  perspectives: AnalysisPerspective[];
  generateEmbeddings: boolean;
  batchSize: number;
  customInstructions?: string;
  scoreThreshold?: number; // Only analyze verses above this threshold
}

export type AnalysisPerspective =
  | 'modern_ethics'
  | 'gender'
  | 'caste'
  | 'contradictions'
  | 'historical_context'
  | 'all';

// ==================== Search & Discovery ====================

export interface SearchParams {
  query: string;
  bookIds?: string[];
  perspectives?: AnalysisPerspective[];
  tags?: string[];
  minScore?: number;
  maxScore?: number;
  limit?: number;
  useSemanticSearch?: boolean;
}

export interface SearchResult {
  verse: Verse;
  analysis: Analysis;
  relevance: number;
  highlights?: string[];
}

// ==================== API Requests/Responses ====================

export interface UploadRequest {
  file: File;
  metadata?: {
    title?: string;
    language?: string;
    era?: string;
    author?: string;
  };
}

export interface UploadResponse {
  documentId: string;
  filename: string;
  size: number;
  status: ProcessingStatus;
}

export interface ParseRequest {
  documentId: string;
  customInstructions?: string;
  expectedFormat?: 'chapter-verse' | 'sections' | 'auto';
}

export interface AnalyzeRequest {
  bookId: string;
  config: AnalysisConfig;
}

export interface JobStatusResponse {
  job: ProcessingJob;
  logs?: string[];
}

// ==================== UI State ====================

export interface BookViewState {
  selectedBook?: Book;
  selectedChapter?: number;
  selectedVerse?: Verse;
  selectedAnalysis?: Analysis;
  activePerspective?: AnalysisPerspective;
}

export interface FilterState {
  perspectives: AnalysisPerspective[];
  tags: string[];
  scoreRange: [number, number];
  searchQuery: string;
}
